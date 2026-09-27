// ============================================================================
//  Postie POS - Returns repository (roadmap P1.4 — trả hàng theo hóa đơn)
// ----------------------------------------------------------------------------
//  createReturn() là 1 transaction duy nhất:
//    INSERT returns + return_details (theo order_detail_id gốc)
//    + stock_movements type=1 delta dương (trigger trả tồn)
//    + orders.status=3 KHI trả đủ toàn bộ đơn
//    + hoàn tiền qua customer_ledger nếu đơn bán chịu (trigger trừ balance)
//    + nhả voucher khi trả đủ đơn (schema 2.24).
//
//  Số tiền hoàn từng dòng được tính lại theo GIÁ ĐÃ GIẢM: snapshot
//  order_details.subtotal (đã gồm thuế dòng) trừ đi phần alloc giảm giá toàn
//  đơn phân bổ theo tỷ lệ — đúng nguyên tắc KiotViet "giá trị tính lại theo
//  giá đã giảm (khuyến mại)". Trả 1 phần đơn: status giữ nguyên, các phiếu
//  sau vẫn trả tiếp được phần còn lại.
//
//  Nghiệp vụ hoàn tiền mặt (đơn đã trả đủ tiền): chỉ PHẦN CASH của đơn gốc
//  mới đụng tới két — returns không có cột phương thức hoàn nên phần cash suy
//  theo tỷ lệ thanh toán của đơn (cash_paid/order.total); đơn thuần CARD/QR
//  hoàn qua thẻ, két không mất tiền mặt. Event shift_cash_events type=1 (chi)
//  ghi vào ca ĐANG MỞ của người trả hàng (fallback: ca của đơn nếu còn mở);
//  không có ca mở -> chặn trả hàng (tiền mặt phải nằm trong một ca để đối ca).
//  shifts.close tính expected = opening + cash_sales(status 1,3,4) + SUM(thu)
//  − SUM(chi): cash của đơn trả đủ (status 3) vẫn được tính vì tiền bán đã vào
//  két, phần hoàn đi ra qua event — cộng trừ từng phía nên không bao giờ nhân đôi.
// ============================================================================

import { getDb, prepare } from '../connection.js'
import * as productsRepo from './products.js'
import * as promotionsRepo from './promotions.js'
import * as shiftsRepo from './shifts.js'
import type { Order, OrderDetailRow } from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ — CHƯA có trong src/shared/types.ts (phase tích hợp sẽ bổ sung;
// liệt kê trong missingTypes của WorkResult).
// ----------------------------------------------------------------------------

export interface CreateReturnLineInput {
  /** ID dòng hàng gốc trong order_details của đơn bị trả. */
  order_detail_id: number
  /** Số lượng trả (> 0, không vượt phần chưa trả của dòng). */
  quantity: number
}

export interface CreateReturnInput {
  order_id: number
  lines: CreateReturnLineInput[]
  /** Lý do trả hàng (in lên phiếu / audit). */
  reason?: string
  user_id: number
}

export interface ReturnDetailRow {
  id: number
  return_id: number
  order_detail_id: number
  quantity: number
  /** Số tiền hoàn cho dòng này (cents) — đã trừ phần khuyến mại phân bổ. */
  refund_amount: number
  /** Joined cho UI. */
  product_id?: number
  product_name?: string | null
  unit_price?: number
}

export interface ReturnRow {
  id: number
  order_id: number
  user_id: number
  /** Tổng tiền hoàn của phiếu (cents). */
  total: number
  reason: string | null
  created_at: number
  /** Joined cho UI. */
  invoice_no?: number
  details?: ReturnDetailRow[]
}

/**
 * Tạo phiếu trả hàng cho 1 hóa đơn (có thể trả từng phần, nhiều phiếu cho
 * đến khi hết hàng có thể trả). Trả về phiếu vừa tạo (kèm details).
 *
 * Điều kiện: đơn tồn tại, KHÔNG phải đơn treo, status IN (0, 1, 4)
 * (0/4 = bán chịu vẫn trả được — tiền hoàn trừ vào công nợ khách);
 * status 2 (đã hủy) và 3 (đã trả đủ) bị chặn.
 */
export function createReturn(input: CreateReturnInput): ReturnRow {
  requireInt(input.user_id, 'Người thực hiện')
  requireInt(input.order_id, 'Mã đơn hàng')
  if (!input.lines || input.lines.length === 0) {
    throw new Error('Chọn ít nhất một dòng hàng để trả.')
  }

  const db = getDb()
  let returnId = 0
  const tx = db.transaction(() => {
    // 1. Đơn phải trả được.
    const order = prepare(`SELECT * FROM orders WHERE id = ?`).get(input.order_id) as
      | Order
      | undefined
    if (!order) throw new Error(`Không tìm thấy đơn hàng #${input.order_id}.`)
    if (order.held_at != null) {
      throw new Error('Đơn đang treo chưa thanh toán — không thể trả hàng.')
    }
    if (order.status === 2) {
      throw new Error(`Đơn #${order.invoice_no} đã bị hủy — không thể trả hàng.`)
    }
    if (order.status === 3) {
      throw new Error(`Đơn #${order.invoice_no} đã được trả hết hàng.`)
    }

    // 2. Dòng hàng gốc (JOIN products để báo lỗi/hiển thị theo tên).
    const details = prepare(`
      SELECT od.*, p.name AS product_name
        FROM order_details od
        JOIN products p ON p.id = od.product_id
       WHERE od.order_id = ?
       ORDER BY od.id
    `).all(order.id) as Array<OrderDetailRow & { product_name: string }>
    const detailById = new Map(details.map(d => [d.id, d]))

    // 3. Số lượng đã trả trước đó của từng dòng (các phiếu trả trước).
    const returnedRows = prepare(`
      SELECT rd.order_detail_id AS id, COALESCE(SUM(rd.quantity), 0) AS q
        FROM return_details rd
        JOIN returns r ON r.id = rd.return_id
       WHERE r.order_id = ?
       GROUP BY rd.order_detail_id
    `).all(order.id) as Array<{ id: number; q: number }>
    const returnedByDetail = new Map(returnedRows.map(r => [r.id, r.q]))

    // 4. Phân bổ giảm giá toàn đơn theo tỷ lệ subtotal từng dòng (làm tròn
    //    bù vào dòng cuối để tổng khớp orders.discount_amount).
    const subtotalSum = details.reduce((s, d) => s + d.subtotal, 0)
    const allocById = new Map<number, number>()
    let used = 0
    details.forEach((d, i) => {
      const isLast = i === details.length - 1
      const share =
        subtotalSum > 0 && !isLast
          ? Math.round((order.discount_amount * d.subtotal) / subtotalSum)
          : Math.max(0, order.discount_amount - used)
      allocById.set(d.id, share)
      used += share
    })

    // 5. Validate từng dòng trả + tính tiền hoàn theo giá đã giảm.
    const slipLines: Array<{ detail: OrderDetailRow & { product_name: string }; quantity: number; refund: number }> = []
    for (const line of input.lines) {
      requireInt(line.order_detail_id, 'Dòng hàng cần trả')
      requireInt(line.quantity, 'Số lượng trả')
      const d = detailById.get(line.order_detail_id)
      if (!d) throw new Error('Dòng hàng cần trả không thuộc đơn này.')
      if (line.quantity <= 0) throw new Error(`Số lượng trả của "${d.product_name}" phải dương.`)

      const already = returnedByDetail.get(d.id) ?? 0
      const remaining = d.quantity - already
      if (line.quantity > remaining) {
        throw new Error(
          `Dòng "${d.product_name}" chỉ còn có thể trả ${Math.max(0, remaining)} (đã trả ${already}/${d.quantity}).`
        )
      }

      const netLine = Math.max(0, d.subtotal - (allocById.get(d.id) ?? 0))
      const refund = Math.round((netLine * line.quantity) / d.quantity)
      slipLines.push({ detail: d, quantity: line.quantity, refund })
    }
    const slipTotal = slipLines.reduce((s, l) => s + l.refund, 0)

    // 6. INSERT phiếu + chi tiết.
    const info = prepare(`
      INSERT INTO returns (order_id, user_id, total, reason)
      VALUES (?, ?, ?, ?)
    `).run(order.id, input.user_id, slipTotal, input.reason?.trim() || null)
    returnId = Number(info.lastInsertRowid)

    const detailStmt = prepare(`
      INSERT INTO return_details (return_id, order_detail_id, quantity, refund_amount)
      VALUES (?, ?, ?, ?)
    `)
    for (const l of slipLines) {
      detailStmt.run(returnId, l.detail.id, l.quantity, l.refund)
    }

    // 7. Nhập lại kho: movement type=1 (return), delta dương, gắn order.
    for (const l of slipLines) {
      productsRepo.adjustStock({
        productId: l.detail.product_id,
        delta: l.quantity,
        type: 1, // return
        orderId: order.id,
        note: `Trả hàng #${order.invoice_no}`,
        userId: input.user_id
      })
    }

    // 8. Hoàn tiền: đơn bán chịu (chưa trả đủ) -> customer_ledger (trigger trừ
    //    balance; hoàn nhiều hơn nợ còn lại -> balance âm = cửa hàng nợ khách,
    //    phiếu ghi nợ/credit note — schema cho phép balance âm).
    //
    //    Đơn đã trả đủ tiền -> phần hoàn bằng TIỀN MẶT mới đụng tới két:
    //    returns/return_details không có cột phương thức hoàn nên phần cash
    //    được suy theo tỷ lệ thanh toán của đơn gốc (join order_payments/
    //    payment_methods, code='CASH'):
    //        cash_refund = slipTotal × cash_paid / order.total
    //    Đơn thuần cash -> cash_refund = slipTotal; đơn thuần CARD/QR -> 0
    //    (tiền hoàn đi lại qua thẻ, két không mất tiền mặt — không ghi event,
    //     nếu ghi toàn bộ slipTotal thì kết ca báo "két thừa ảo"); đơn thanh
    //    toán kép -> phân bổ theo tỷ lệ. Event type=1 (chi) ghi vào ca ĐANG
    //    MỞ của người trả hàng (fallback: ca của đơn nếu còn mở) để
    //    shifts.close trừ khỏi expected_cash của ĐÚNG ca mất tiền — kể cả khi
    //    đơn thuộc ca khác/đã đóng. Không có ca nào đang mở thì dòng chi không
    //    thuộc về ca nào để đối ca — CHẶN trả hàng thay vì bỏ qua im lặng.
    if (slipTotal > 0) {
      if (order.customer_id && order.paid_amount < order.total) {
        prepare(`
          INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
          VALUES (?, 1, ?, ?, ?, ?)
        `).run(
          order.customer_id,
          -slipTotal,
          order.id,
          `Trả hàng đơn #${order.invoice_no}`,
          input.user_id
        )
      } else {
        const cashPaidRow = prepare(`
          SELECT COALESCE(SUM(op.amount), 0) AS c
            FROM order_payments op
            JOIN payment_methods pm ON pm.id = op.payment_method_id
           WHERE op.order_id = ? AND pm.code = 'CASH'
        `).get(order.id) as { c: number }
        const cashRefund = Math.min(
          slipTotal,
          Math.round((slipTotal * cashPaidRow.c) / Math.max(1, order.total))
        )
        if (cashRefund > 0) {
          const refundShift =
            shiftsRepo.getActive(input.user_id) ??
            (order.shift_id != null ? shiftsRepo.getById(order.shift_id) : undefined)
          if (!refundShift || refundShift.status !== 0) {
            throw new Error(
              'Không có ca nào đang mở — không thể ghi dòng hoàn tiền mặt. Vui lòng mở ca trước khi trả hàng.'
            )
          }
          prepare(`
            INSERT INTO shift_cash_events (shift_id, type, amount, note, created_by)
            VALUES (?, 1, ?, ?, ?)
          `).run(
            refundShift.id,
            cashRefund,
            `Hoàn tiền trả hàng #${order.invoice_no}`,
            input.user_id
          )
        }
      }
    }

    // 9. Trả đủ toàn bộ đơn -> status=3 + nhả voucher của đơn.
    const returnedAfter = new Map(returnedByDetail)
    for (const l of slipLines) {
      returnedAfter.set(l.detail.id, (returnedAfter.get(l.detail.id) ?? 0) + l.quantity)
    }
    const fullyReturned = details.every(d => (returnedAfter.get(d.id) ?? 0) >= d.quantity)
    if (fullyReturned) {
      prepare(`UPDATE orders SET status = 3 WHERE id = ?`).run(order.id)
      promotionsRepo.releaseVoucher(order.id)
    }
  })
  tx()

  return getReturnById(returnId) as ReturnRow
}

function requireInt(value: number, label: string): void {
  if (!Number.isInteger(value)) throw new Error(`${label} phải là số nguyên.`)
}

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

export function getReturnById(id: number): ReturnRow | undefined {
  const row = prepare(`
    SELECT r.*, o.invoice_no
      FROM returns r
      JOIN orders o ON o.id = r.order_id
     WHERE r.id = ?
  `).get(id) as ReturnRow | undefined
  if (!row) return undefined
  row.details = prepare(`
    SELECT rd.*, od.product_id, p.name AS product_name, od.unit_price
      FROM return_details rd
      JOIN order_details od ON od.id = rd.order_detail_id
      JOIN products p ON p.id = od.product_id
     WHERE rd.return_id = ?
     ORDER BY rd.id
  `).all(id) as ReturnDetailRow[]
  return row
}

/** Tất cả phiếu trả của một đơn (mới nhất trước). */
export function listByOrder(orderId: number): ReturnRow[] {
  const rows = prepare(`
    SELECT r.*, o.invoice_no
      FROM returns r
      JOIN orders o ON o.id = r.order_id
     WHERE r.order_id = ?
     ORDER BY r.created_at DESC, r.id DESC
  `).all(orderId) as ReturnRow[]
  const detailStmt = prepare(`
    SELECT rd.*, od.product_id, p.name AS product_name, od.unit_price
      FROM return_details rd
      JOIN order_details od ON od.id = rd.order_detail_id
      JOIN products p ON p.id = od.product_id
     WHERE rd.return_id = ?
     ORDER BY rd.id
  `)
  for (const r of rows) {
    r.details = detailStmt.all(r.id) as ReturnDetailRow[]
  }
  return rows
}

/** Phiếu trả gần đây (màn Đổi trả / báo cáo). */
export function listRecent(limit = 50): ReturnRow[] {
  return prepare(`
    SELECT r.*, o.invoice_no
      FROM returns r
      JOIN orders o ON o.id = r.order_id
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ?
  `).all(limit) as ReturnRow[]
}
