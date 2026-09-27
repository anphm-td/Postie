// ============================================================================
//  Postie POS - Orders repository
// ----------------------------------------------------------------------------
//  create() is the single most important transaction in the app: it inserts
//  the invoice header + line items + payments, decrements stock, and records
//  stock_movements — all atomically.
//
//  Bổ sung theo lộ trình (docs/kiotviet-roadmap.md):
//    - P1.1  snapshot cost_cents vào order_details tại thời điểm bán.
//    - P2.1  engine khuyến mại + voucher áp dụng trong create()/hold()
//            (giảm theo dòng gộp vào order_details.discount_amount, giảm toàn
//            đơn gộp vào orders.discount_amount + discount_reason — snapshot).
//    - P0.3  voidOrder(): hủy đơn status=2 + trả tồn + audit_log + nhả voucher.
//    - P1.5  đơn treo xuống DB: hold()/updateHeld()/convertHeld()/listHeld()
//            dùng orders.held_at (status=0 vẫn là "chưa trả đủ" — phân biệt
//            bằng held_at, đúng ghi chú của schema).
//    - P1.6  buildVietQRPayload(): chuỗi payload VietQR tĩnh (EMVCo) — bước 1
//            khả thi offline của "QR thông báo tiền về"; hiển thị hình QR và
//            lưu order_payments.reference là việc của phase tích hợp.
// ============================================================================

import { getDb, prepare } from '../connection.js'
import * as productsRepo from './products.js'
import * as promotionsRepo from './promotions.js'
import type {
  CreateOrderInput,
  HeldBill,
  ListOrdersOptions,
  Order,
  OrderDetailRow,
  OrderItemInput,
  OrderListResult,
  OrderPaymentInput,
  OrderStatus,
  Voucher
} from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ — CHƯA có trong src/shared/types.ts (phase tích hợp sẽ bổ sung
// vào đó; liệt kê trong missingTypes của WorkResult).
// ----------------------------------------------------------------------------

/** Input tạo đơn mở rộng: engine khuyến mại + voucher. */
export interface CreateOrderWithPromotionsInput extends CreateOrderInput {
  /** Mặc định true: tự áp các CTKM đang hiệu lực (KiotViet "Hộp quà"). */
  apply_promotions?: boolean
  /** Chỉ áp các CTKM được chọn; bỏ qua = tự động tất cả. */
  promotion_ids?: number[]
  /** Mã voucher nhập ở bước thanh toán; được "đốt" sau khi tạo đơn thành công. */
  voucher_code?: string
}

/** Đơn treo: như tạo đơn nhưng KHÔNG nhận thanh toán, KHÔNG trừ tồn. */
export type HoldOrderInput = Omit<CreateOrderWithPromotionsInput, 'payments'>

/** Sửa đơn treo. Mọi field đều tùy chọn. */
export interface UpdateHeldOrderInput {
  /** Có items -> thay toàn bộ dòng hàng và chạy lại engine khuyến mại.
   *  Không items -> giữ nguyên dòng hàng (snapshot), chỉ sửa khách/note và
   *  giảm giá toàn đơn (discount_amount nếu truyền sẽ THAY THẾ toàn bộ mức
   *  giảm hiện có trên header). */
  items?: OrderItemInput[]
  customer_id?: number | null
  discount_amount?: number
  discount_reason?: string
  note?: string
  apply_promotions?: boolean
  promotion_ids?: number[]
  /** string = đổi voucher; null = bỏ voucher; undefined = giữ voucher hiện tại
   *  (chỉ có tác dụng khi truyền items — nhánh giữ nguyên snapshot dòng hàng
   *  không chạy lại engine nên cũng không xử lý voucher). */
  voucher_code?: string | null
}

/** Chuyển đơn treo thành hóa đơn: nhận thanh toán + trừ tồn. */
export interface ConvertHeldOrderInput {
  payments: OrderPaymentInput[]
  /** Người/ ca thực hiện chuyển (có thể khác người giữ đơn). */
  user_id?: number
  shift_id?: number | null
  /** Tùy chọn: áp giỏ hiện tại (thay toàn bộ dòng hàng + giảm giá toàn đơn,
   *  chạy lại engine khuyến mại — cùng ngữ nghĩa updateHeld với items) TRONG
   *  CÙNG transaction với nhận tiền + trừ tồn. Thay cho gọi updateHeld() riêng
   *  trước convertHeld(): cách cũ ghi đè snapshot đơn treo vĩnh viễn khi nhận
   *  tiền thất bại giữa chừng (vd guard tồn âm ở products.adjustStock). */
  items?: OrderItemInput[]
  customer_id?: number | null
  discount_amount?: number
  apply_promotions?: boolean
  promotion_ids?: number[]
}

/** Tham số sinh payload VietQR tĩnh (P1.6 — stub: chưa có webhook đối soát). */
export interface VietQRParams {
  /** Mã BIN ngân hàng 6 chữ số (VD '970422' = Vietcombank). */
  bankBin: string
  /** Số tài khoản nhận tiền. */
  accountNo: string
  /** Số tiền theo CENT nội bộ — payload QR quy ra đồng (chia 100). */
  amount_cents?: number
  /** Nội dung chuyển khoản — nên là mã hóa đơn (ASCII) để đối soát. */
  description?: string
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Round cents safely (defensive — inputs should already be integers). */
function roundCents(n: number): number {
  return Math.round(n)
}

function requireInt(value: number, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} phải là số nguyên.`)
  return value
}

interface ComputedDetailRow {
  product_id: number
  unit_price: number
  quantity: number
  tax_rate: number
  tax_amount: number
  /** Giảm giá dòng = giảm thủ công + khuyến mại theo dòng (SNAPSHOT). */
  discount_amount: number
  subtotal: number
  note: string | null
  /** SNAPSHOT giá vốn tại thời điểm bán (P1.1). */
  cost_cents: number
}

interface ComputedOrder {
  detailRows: ComputedDetailRow[]
  subtotalBeforeTax: number
  taxTotal: number
  /** Giảm giá toàn đơn = thủ công + CTKM + voucher, chặn bởi tổng tiền. */
  orderDiscount: number
  total: number
  voucher: Voucher | null
  discountReason: string | null
}

function nextInvoiceNo(): number {
  const maxRow = prepare(`SELECT MAX(invoice_no) AS m FROM orders`).get() as { m: number | null } | undefined
  return (maxRow?.m ?? 0) + 1
}

function insertDetails(orderId: number, rows: ComputedDetailRow[]): void {
  const stmt = prepare(`
    INSERT INTO order_details
      (order_id, product_id, unit_price, cost_cents, quantity, tax_rate, tax_amount, discount_amount, subtotal, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const d of rows) {
    stmt.run(orderId, d.product_id, d.unit_price, d.cost_cents, d.quantity, d.tax_rate,
      d.tax_amount, d.discount_amount, d.subtotal, d.note)
  }
}

/**
 * Tính toán toàn bộ dòng hàng + tổng tiền cho một đơn, BAO GỒM engine khuyến
 * mại + voucher (chỉ đọc, chưa "đốt" voucher). Dùng chung cho create/hold/
 * updateHeld để mọi đường đi snapshot giảm giá giống hệt nhau.
 */
function computeOrderParts(
  input: Omit<CreateOrderWithPromotionsInput, 'payments'>,
  opts: { voucherAllowUsedByOrderId?: number } = {}
): ComputedOrder {
  const items = input.items
  if (!items || items.length === 0) {
    throw new Error('Không thể tạo đơn không có sản phẩm.')
  }

  // 1. Validate input (cents là INTEGER — sai kiểu sẽ phá hạch toán).
  items.forEach((item, i) => {
    const line = `dòng ${i + 1}`
    requireInt(item.product_id, `Mã sản phẩm (${line})`)
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Số lượng (${line}) phải là số nguyên dương.`)
    }
    if (!Number.isInteger(item.unit_price) || item.unit_price < 0) {
      throw new Error(`Đơn giá (${line}) phải là số nguyên không âm.`)
    }
    if (!Number.isInteger(item.tax_rate) || item.tax_rate < 0 || item.tax_rate > 10000) {
      throw new Error(`Thuế suất (${line}) phải trong khoảng 0–10000‰.`)
    }
    if (item.discount_amount != null &&
        (!Number.isInteger(item.discount_amount) || item.discount_amount < 0)) {
      throw new Error(`Giảm giá theo dòng (${line}) phải là số nguyên không âm.`)
    }
  })
  if (input.discount_amount != null &&
      (!Number.isInteger(input.discount_amount) || input.discount_amount < 0)) {
    throw new Error('Giảm giá toàn đơn phải là số nguyên không âm.')
  }

  // 2. Snapshot giá vốn theo từng sản phẩm (P1.1) — fail sớm nếu thiếu SP.
  const productIds = [...new Set(items.map(i => i.product_id))]
  const placeholders = productIds.map(() => '?').join(',')
  const costRows = prepare(
    `SELECT id, cost FROM products WHERE id IN (${placeholders})`
  ).all(...productIds) as Array<{ id: number; cost: number }>
  const costById = new Map(costRows.map(r => [r.id, r.cost]))
  for (const id of productIds) {
    if (!costById.has(id)) throw new Error(`Không tìm thấy sản phẩm #${id}.`)
  }

  // 3. Engine khuyến mại (đọc promotions; bỏ qua khi apply_promotions=false).
  const engine: promotionsRepo.CartDiscountResult = input.apply_promotions === false
    ? { line_extra_discounts: items.map(() => 0), order_discount: 0, applications: [] }
    : promotionsRepo.resolveCartDiscounts({
        items: items.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_amount: i.discount_amount ?? 0
        })),
        customer_id: input.customer_id ?? null,
        promotion_ids: input.promotion_ids
      })

  // 4. Voucher (chỉ tra cứu — "đốt" sau khi INSERT đơn thành công).
  const voucher = input.voucher_code
    ? promotionsRepo.findVoucherForRedemption(input.voucher_code, {
        allowUsedByOrderId: opts.voucherAllowUsedByOrderId
      })
    : null

  // 5. Tính từng dòng: giảm thủ công + giảm KM theo dòng, chặn ở giá dòng.
  let subtotalBeforeTax = 0
  let taxTotal = 0
  const detailRows: ComputedDetailRow[] = []
  for (const [i, item] of items.entries()) {
    const gross = roundCents(item.unit_price * item.quantity)
    const manual = item.discount_amount ?? 0
    const promoLine = engine.line_extra_discounts[i] ?? 0
    const lineDiscount = Math.min(gross, manual + promoLine)
    const taxableBase = Math.max(0, gross - lineDiscount)
    // tax_rate là per-mille (1000 = 10%) -> chia 10000 để ra cents.
    const lineTax = roundCents((taxableBase * item.tax_rate) / 10000)
    const lineSubtotal = roundCents(taxableBase + lineTax)

    subtotalBeforeTax += taxableBase
    taxTotal += lineTax
    detailRows.push({
      product_id: item.product_id,
      unit_price: item.unit_price,
      quantity: item.quantity,
      tax_rate: item.tax_rate,
      tax_amount: lineTax,
      discount_amount: lineDiscount,
      subtotal: lineSubtotal,
      note: item.note ?? null,
      cost_cents: costById.get(item.product_id) ?? 0
    })
  }

  // 6. Tổng đơn: giảm thủ công + KM toàn đơn + voucher, chặn bởi tổng tiền
  //    (CHECK total >= 0 của schema).
  const cap = subtotalBeforeTax + taxTotal
  const orderDiscount = Math.min(
    cap,
    (input.discount_amount ?? 0) + engine.order_discount + (voucher?.value_cents ?? 0)
  )
  const total = Math.max(0, cap - orderDiscount)

  // 7. Snapshot lý do giảm giá (giảm thủ công + tên CTKM + mã voucher).
  const reasonParts = [
    input.discount_reason,
    ...engine.applications.map(a => `KM: ${a.promotion.name}`)
  ]
  if (voucher) reasonParts.push(`Voucher: ${voucher.code}`)
  const discountReason =
    reasonParts.map(p => p?.trim()).filter((p): p is string => !!p).join('; ') || null

  return { detailRows, subtotalBeforeTax, taxTotal, orderDiscount, total, voucher, discountReason }
}

function validatePayments(payments: OrderPaymentInput[]): void {
  payments.forEach((p, i) => {
    requireInt(p.payment_method_id, `Phương thức thanh toán (dòng ${i + 1})`)
    if (!Number.isInteger(p.amount) || p.amount < 0) {
      throw new Error(`Số tiền thanh toán (dòng ${i + 1}) phải là số nguyên không âm.`)
    }
  })
}

// ----------------------------------------------------------------------------
// create — bán tại quầy
// ----------------------------------------------------------------------------

/**
 * Create a complete sale in one transaction.
 *
 * Steps:
 *   1. Generate invoice_no = MAX(invoice_no) + 1  (UNIQUE guards against races)
 *   2. Run the promotion engine + voucher lookup, compute per-line tax /
 *      subtotal / cost snapshot and order totals (computeOrderParts)
 *   3. INSERT orders header (discount snapshot: amount + reason)
 *   4. INSERT order_details (price/tax/cost snapshots + per-line discount)
 *   5. INSERT order_payments (split-tender)
 *   6. Decrement stock via stock_movements (trigger syncs products.stock)
 *   7. If credit sale (customer + unpaid remainder), INSERT customer_ledger
 *      (trigger syncs customers.balance)
 *   8. Redeem the voucher (used_order_id) — guarded inside the same tx
 *   9. Return the full order with details + payments
 */
export function create(input: CreateOrderWithPromotionsInput): Order {
  const db = getDb()
  const tx = db.transaction(() => {
    const parts = computeOrderParts(input)
    validatePayments(input.payments ?? [])

    const invoiceNo = nextInvoiceNo()
    const paidAmount = input.payments.reduce((s, p) => s + p.amount, 0)
    const owed = parts.total - paidAmount
    // Đơn thiếu tiền bắt buộc phải gắn khách hàng bán chịu, nếu không số nợ
    // không được ghi nhận qua customer_ledger.
    if (owed > 0 && !input.customer_id) {
      throw new Error('Đơn còn thiếu tiền nhưng chưa gắn khách hàng — không thể bán chịu.')
    }
    const status: OrderStatus = paidAmount >= parts.total ? 1 : paidAmount > 0 ? 4 : 0

    const orderInfo = prepare(`
      INSERT INTO orders
        (invoice_no, user_id, customer_id, shift_id,
         subtotal_before_tax, tax_total, discount_amount, total,
         paid_amount, status, discount_reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNo,
      input.user_id,
      input.customer_id ?? null,
      input.shift_id ?? null,
      parts.subtotalBeforeTax,
      parts.taxTotal,
      parts.orderDiscount,
      parts.total,
      paidAmount,
      status,
      parts.discountReason,
      input.note ?? null
    )
    const orderId = Number(orderInfo.lastInsertRowid)

    insertDetails(orderId, parts.detailRows)

    const payStmt = prepare(`
      INSERT INTO order_payments (order_id, payment_method_id, amount, reference)
      VALUES (?, ?, ?, ?)
    `)
    for (const p of input.payments) {
      payStmt.run(orderId, p.payment_method_id, p.amount, p.reference ?? null)
    }

    // Trừ tồn + ghi movements (trigger tự sync products.stock).
    for (const d of parts.detailRows) {
      productsRepo.adjustStock({
        productId: d.product_id,
        delta: -d.quantity,
        type: 0, // sale
        orderId,
        note: `Sale #${invoiceNo}`,
        userId: input.user_id
      })
    }

    // Bán chịu: ghi customer_ledger (trigger tự sync customers.balance).
    if (input.customer_id && owed > 0) {
      prepare(`
        INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
        VALUES (?, 0, ?, ?, ?, ?)
      `).run(
        input.customer_id,
        owed,                         // positive => increases debt
        orderId,
        `Credit sale #${invoiceNo}`,
        input.user_id
      )
    }

    // "Đốt" voucher sau khi đơn đã chốt (guard WHERE chống dùng 2 lần).
    if (parts.voucher) {
      promotionsRepo.redeemVoucher(parts.voucher.id, orderId)
    }

    return getById(orderId) as Order
  })

  return tx()
}

// ----------------------------------------------------------------------------
// void — hủy đơn (P0.3)
// ----------------------------------------------------------------------------

/**
 * Hủy đơn trong 1 transaction: status=2 + trả tồn (movement type=3 adjust,
 * delta dương) + xóa nợ bán chịu qua customer_ledger (type=2) + nhả voucher +
 * audit_log action='VOID_ORDER'.
 *
 * Trả tồn CHỈ phần chưa được trả hàng hoàn kho: số lượng đã trả qua phiếu trả
 * hàng (returns/return_details) đã được nhập lại kho tại returns.createReturn
 * (movement type=1) — trả đủ d.quantity sẽ khống tồn. Đơn trả một phần (status
 * 1/4) vẫn hủy được, nên phải trừ phần đã trả của từng dòng.
 *
 * Lưu ý nghiệp vụ: tiền KHÁCH ĐÃ TRẢ khi hủy hoàn lại tại quầy (không ghi
 * sổ ở đây). shifts.close tính tiền mặt theo orders.status IN (1,4)
 * nên đơn hủy tự động rút khỏi expected_cash.
 */
export function voidOrder(id: number, userId: number, reason?: string): Order {
  requireInt(id, 'Mã đơn hàng')
  requireInt(userId, 'Người thực hiện')
  const db = getDb()
  const tx = db.transaction(() => {
    const order = prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as Order | undefined
    if (!order) throw new Error(`Không tìm thấy đơn hàng #${id}.`)
    if (order.status === 2) throw new Error(`Đơn #${order.invoice_no} đã bị hủy trước đó.`)
    if (order.status === 3) {
      throw new Error(`Đơn #${order.invoice_no} đã trả hàng — không thể hủy, dùng quy trình trả hàng.`)
    }
    const details = prepare(`SELECT * FROM order_details WHERE order_id = ? ORDER BY id`)
      .all(id) as OrderDetailRow[]

    if (order.held_at == null) {
      // Số lượng đã trả hoàn kho trước đó của từng dòng (các phiếu trả trước).
      const returnedRows = prepare(`
        SELECT rd.order_detail_id AS detail_id, COALESCE(SUM(rd.quantity), 0) AS q
          FROM return_details rd
          JOIN returns r ON r.id = rd.return_id
         WHERE r.order_id = ?
         GROUP BY rd.order_detail_id
      `).all(id) as Array<{ detail_id: number; q: number }>
      const returnedByDetail = new Map(returnedRows.map(r => [r.detail_id, r.q]))

      // Đơn đã bán: trả tồn phần CHƯA trả của từng dòng (delta dương).
      for (const d of details) {
        const toRestore = d.quantity - (returnedByDetail.get(d.id) ?? 0)
        if (toRestore <= 0) continue // dòng đã trả hết qua trả hàng — kho đã nhận lại
        productsRepo.adjustStock({
          productId: d.product_id,
          delta: toRestore,
          type: 3, // adjust — hủy đơn không phải trả hàng của khách
          orderId: id,
          note: `Hủy đơn #${order.invoice_no}`,
          userId
        })
      }
      // Bán chịu: xóa phần nợ còn lại của đơn (ledger type=2 điều chỉnh).
      const owed = order.total - order.paid_amount
      if (order.customer_id && owed > 0) {
        prepare(`
          INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
          VALUES (?, 2, ?, ?, ?, ?)
        `).run(
          order.customer_id,
          -owed,
          id,
          `Hủy đơn #${order.invoice_no} — xóa nợ bán chịu`,
          userId
        )
      }
    }

    // Đơn treo bị hủy bỏ: rời khỏi danh sách đơn treo (held_at=NULL).
    prepare(`UPDATE orders SET status = 2, held_at = NULL WHERE id = ?`).run(id)

    // Nhả voucher nếu đơn có dùng (schema 2.24: void/refund releases voucher).
    promotionsRepo.releaseVoucher(id)

    prepare(`
      INSERT INTO audit_log (user_id, action, table_name, record_id, old_values, new_values)
      VALUES (?, 'VOID_ORDER', 'orders', ?, ?, ?)
    `).run(
      userId,
      id,
      JSON.stringify({
        status: order.status,
        total: order.total,
        paid_amount: order.paid_amount,
        held_at: order.held_at
      }),
      JSON.stringify({ status: 2, reason: reason ?? null })
    )
  })
  tx()
  return getById(id) as Order
}

// ----------------------------------------------------------------------------
// Held bills — đơn treo / giữ đơn (P1.5)
// ----------------------------------------------------------------------------

/**
 * Giữ đơn: tính giá + khuyến mại TẠI THỜI ĐIỂM GIỮ (snapshot vào header/
 * details, "đốt" voucher nếu có) nhưng KHÔNG trừ tồn, KHÔNG nhận thanh toán.
 * status=0 + held_at=unixepoch().
 */
export function hold(input: HoldOrderInput): Order {
  const db = getDb()
  const tx = db.transaction(() => {
    const parts = computeOrderParts(input)

    const invoiceNo = nextInvoiceNo()
    const orderInfo = prepare(`
      INSERT INTO orders
        (invoice_no, user_id, customer_id, shift_id,
         subtotal_before_tax, tax_total, discount_amount, total,
         paid_amount, status, held_at, discount_reason, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, unixepoch(), ?, ?)
    `).run(
      invoiceNo,
      input.user_id,
      input.customer_id ?? null,
      input.shift_id ?? null,
      parts.subtotalBeforeTax,
      parts.taxTotal,
      parts.orderDiscount,
      parts.total,
      parts.discountReason,
      input.note ?? null
    )
    const orderId = Number(orderInfo.lastInsertRowid)

    insertDetails(orderId, parts.detailRows)

    if (parts.voucher) promotionsRepo.redeemVoucher(parts.voucher.id, orderId)

    return getById(orderId) as Order
  })
  return tx()
}

function currentVoucherCode(orderId: number): string | null {
  const row = prepare(`SELECT code FROM vouchers WHERE used_order_id = ?`)
    .get(orderId) as { code: string } | undefined
  return row?.code ?? null
}

/** Voucher đang "đốt" bởi đơn (id) — undefined nếu đơn không giữ voucher nào. */
function attachedVoucherId(orderId: number): number | undefined {
  const row = prepare(`SELECT id FROM vouchers WHERE used_order_id = ?`)
    .get(orderId) as { id: number } | undefined
  return row?.id
}

/**
 * Thay toàn bộ dòng hàng của đơn treo theo giỏ mới: chạy lại engine khuyến mại
 * + voucher (computeOrderParts), ghi đè order_details và tổng tiền header, rồi
 * ĐỐI CHIẾU vòng đời voucher:
 *   * đổi voucher (mã mới khác mã đang gắn) -> nhả mã cũ, "đốt" mã mới;
 *   * bỏ voucher (voucherCode = null hoặc mã không còn) -> nhả mã cũ;
 *   * giữ nguyên (voucherCode = undefined trùng mã đang gắn) -> không đụng gì,
 *     voucher vẫn gắn với đơn từ lúc hold().
 * Không đối chiếu thì voucher được áp vào tổng tiền nhưng used_order_id không
 * đổi — dùng lại được vô hạn, hoặc mã cũ bị bỏ mà vẫn cháy trong pool.
 * Dùng chung bởi updateHeld() và convertHeld() (sửa đơn + nhận tiền trong cùng
 * transaction). PHẢI chạy trong transaction của caller.
 */
function replaceHeldItems(
  id: number,
  current: Order,
  opts: {
    items: OrderItemInput[]
    customerId?: number | null
    discountAmount?: number
    discountReason?: string
    note?: string
    applyPromotions?: boolean
    promotionIds?: number[]
    voucherCode?: string | null
  }
): void {
  const voucherCode =
    opts.voucherCode === undefined ? currentVoucherCode(id) : opts.voucherCode
  const parts = computeOrderParts(
    {
      user_id: current.user_id,
      customer_id: opts.customerId !== undefined ? opts.customerId : current.customer_id,
      items: opts.items,
      discount_amount: opts.discountAmount,
      discount_reason: opts.discountReason,
      note: opts.note,
      apply_promotions: opts.applyPromotions,
      promotion_ids: opts.promotionIds,
      voucher_code: voucherCode ?? undefined
    },
    // Voucher có thể đã được "đốt" bởi chính đơn treo này.
    { voucherAllowUsedByOrderId: id }
  )
  prepare(`DELETE FROM order_details WHERE order_id = ?`).run(id)
  insertDetails(id, parts.detailRows)
  prepare(`
    UPDATE orders
       SET customer_id = ?, subtotal_before_tax = ?, tax_total = ?,
           discount_amount = ?, total = ?, discount_reason = ?, note = ?
     WHERE id = ?
  `).run(
    opts.customerId !== undefined ? opts.customerId : current.customer_id,
    parts.subtotalBeforeTax,
    parts.taxTotal,
    parts.orderDiscount,
    parts.total,
    parts.discountReason,
    opts.note !== undefined ? opts.note : current.note,
    id
  )

  const attached = attachedVoucherId(id)
  if (parts.voucher) {
    if (!attached || attached !== parts.voucher.id) {
      promotionsRepo.releaseVoucher(id)
      promotionsRepo.redeemVoucher(parts.voucher.id, id, id)
    }
  } else if (attached) {
    promotionsRepo.releaseVoucher(id)
  }
}

/**
 * Sửa đơn treo. Có items -> thay toàn bộ dòng hàng và chạy lại engine
 * (voucher cũ được giữ, đổi hoặc bỏ theo voucher_code). Không items -> giữ
 * nguyên dòng hàng như bản snapshot lúc giữ đơn, chỉ sửa khách/note và giảm
 * giá toàn đơn.
 */
export function updateHeld(id: number, input: UpdateHeldOrderInput): Order {
  requireInt(id, 'Mã đơn hàng')
  const db = getDb()
  const tx = db.transaction(() => {
    const current = getById(id)
    if (!current) throw new Error(`Không tìm thấy đơn hàng #${id}.`)
    if (current.held_at == null) throw new Error('Chỉ có thể sửa đơn đang treo.')
    const paymentCount = (prepare(`SELECT COUNT(*) AS c FROM order_payments WHERE order_id = ?`)
      .get(id) as { c: number }).c
    if (paymentCount > 0) throw new Error('Đơn đã có thanh toán — không thể sửa như đơn treo.')

    if (input.discount_amount != null &&
        (!Number.isInteger(input.discount_amount) || input.discount_amount < 0)) {
      throw new Error('Giảm giá toàn đơn phải là số nguyên không âm.')
    }

    if (input.items && input.items.length > 0) {
      replaceHeldItems(id, current, {
        items: input.items,
        customerId: input.customer_id,
        discountAmount: input.discount_amount,
        discountReason: input.discount_reason,
        note: input.note,
        applyPromotions: input.apply_promotions,
        promotionIds: input.promotion_ids,
        voucherCode: input.voucher_code
      })
    } else {
      // Giữ nguyên snapshot dòng hàng; tổng = subtotal + thuế - giảm mới.
      const stored = current.details ?? []
      let subtotalBeforeTax = 0
      let taxTotal = 0
      for (const d of stored) {
        subtotalBeforeTax += Math.max(0, d.unit_price * d.quantity - d.discount_amount)
        taxTotal += d.tax_amount
      }
      const cap = subtotalBeforeTax + taxTotal
      const orderDiscount = Math.min(cap, input.discount_amount ?? current.discount_amount)
      const total = Math.max(0, cap - orderDiscount)
      prepare(`
        UPDATE orders
           SET customer_id = ?, subtotal_before_tax = ?, tax_total = ?,
               discount_amount = ?, total = ?, discount_reason = ?, note = ?
         WHERE id = ?
      `).run(
        input.customer_id !== undefined ? input.customer_id : current.customer_id,
        subtotalBeforeTax,
        taxTotal,
        orderDiscount,
        total,
        input.discount_reason !== undefined ? input.discount_reason : current.discount_reason,
        input.note !== undefined ? input.note : current.note,
        id
      )
    }
  })
  tx()
  return getById(id) as Order
}

/**
 * Chuyển đơn treo thành hóa đơn: nhận thanh toán + trừ tồn (snapshot giá/
 * khuyến mại giữ nguyên từ lúc giữ đơn). Truyền `items` (+ giảm giá/khách) để
 * áp giỏ hiện tại trong CÙNG transaction — thay cho gọi updateHeld() riêng
 * trước đó: nếu trừ tồn thất bại (guard tồn âm) thì cả thay đổi snapshot lẫn
 * thanh toán đều rollback, đơn treo giữ nguyên bản gốc. Trả về đơn đã cập nhật.
 */
export function convertHeld(id: number, params: ConvertHeldOrderInput): Order {
  requireInt(id, 'Mã đơn hàng')
  const db = getDb()
  const tx = db.transaction(() => {
    let order = getById(id)
    if (!order) throw new Error(`Không tìm thấy đơn hàng #${id}.`)
    if (order.held_at == null) throw new Error('Đơn này không phải đơn treo.')
    if (order.status !== 0) throw new Error('Trạng thái đơn không hợp lệ để chuyển đổi.')

    const payments = params.payments ?? []
    validatePayments(payments)

    // Áp giỏ (nếu caller truyền) TRƯỚC khi nhận tiền — cùng transaction.
    if (params.items && params.items.length > 0) {
      replaceHeldItems(id, order, {
        items: params.items,
        customerId: params.customer_id,
        discountAmount: params.discount_amount,
        applyPromotions: params.apply_promotions,
        promotionIds: params.promotion_ids
      })
      order = getById(id) as Order // nạp lại tổng/dòng hàng sau khi thay giỏ
    }

    const paidAmount = payments.reduce((s, p) => s + p.amount, 0)
    const owed = order.total - paidAmount
    if (owed > 0 && !order.customer_id) {
      throw new Error('Đơn còn thiếu tiền nhưng chưa gắn khách hàng — không thể bán chịu.')
    }
    const status: OrderStatus = paidAmount >= order.total ? 1 : paidAmount > 0 ? 4 : 0

    const payStmt = prepare(`
      INSERT INTO order_payments (order_id, payment_method_id, amount, reference)
      VALUES (?, ?, ?, ?)
    `)
    for (const p of payments) {
      payStmt.run(id, p.payment_method_id, p.amount, p.reference ?? null)
    }

    // Trừ tồn (guard tồn âm trong productsRepo.adjustStock -> rollback toàn tx).
    const userId = params.user_id ?? order.user_id
    for (const d of order.details ?? []) {
      productsRepo.adjustStock({
        productId: d.product_id,
        delta: -d.quantity,
        type: 0, // sale
        orderId: id,
        note: `Sale #${order.invoice_no} (từ đơn treo)`,
        userId
      })
    }

    if (order.customer_id && owed > 0) {
      prepare(`
        INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
        VALUES (?, 0, ?, ?, ?, ?)
      `).run(order.customer_id, owed, id, `Credit sale #${order.invoice_no}`, userId)
    }

    prepare(`
      UPDATE orders
         SET status = ?, paid_amount = ?, held_at = NULL, user_id = ?, shift_id = ?
       WHERE id = ?
    `).run(
      status,
      paidAmount,
      userId,
      params.shift_id !== undefined ? params.shift_id : order.shift_id,
      id
    )
  })
  tx()
  return getById(id) as Order
}

/** Danh sách đơn treo (held_at IS NOT NULL, status=0) mới nhất trước. */
export function listHeld(limit = 100): HeldBill[] {
  return prepare(`
    SELECT o.id, o.invoice_no, o.held_at, o.total, o.customer_id,
           c.name AS customer_name, o.user_id,
           (SELECT COALESCE(SUM(od.quantity), 0)
              FROM order_details od WHERE od.order_id = o.id) AS item_count
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
     WHERE o.held_at IS NOT NULL AND o.status = 0
     ORDER BY o.held_at DESC, o.id DESC
     LIMIT ?
  `).all(limit) as HeldBill[]
}

// ----------------------------------------------------------------------------
// Reads
// ----------------------------------------------------------------------------

/** Fetch an order with its details + payments. */
export function getById(id: number): Order | undefined {
  const order = prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as Order | undefined
  if (!order) return undefined
  order.details = prepare(`SELECT * FROM order_details WHERE order_id = ? ORDER BY id`)
    .all(id) as OrderDetailRow[]
  order.payments = prepare(`SELECT * FROM order_payments WHERE order_id = ? ORDER BY id`)
    .all(id) as Order['payments']
  return order
}

/** Tra cứu theo số hóa đơn (màn Đổi trả / in lại hóa đơn). */
export function getByInvoiceNo(invoiceNo: number): Order | undefined {
  requireInt(invoiceNo, 'Số hóa đơn')
  const row = prepare(`SELECT id FROM orders WHERE invoice_no = ?`).get(invoiceNo) as
    | { id: number }
    | undefined
  return row ? getById(row.id) : undefined
}

/** List recent orders (header only). */
export function listRecent(limit = 50): Order[] {
  return prepare(
    `SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(limit) as Order[]
}

/** List orders belonging to a shift (header only, newest first). */
export function listByShift(shiftId: number, limit = 200): Order[] {
  return prepare(
    `SELECT * FROM orders WHERE shift_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(shiftId, limit) as Order[]
}

/** Danh sách hóa đơn cho màn quản lý: lọc theo tìm kiếm / trạng thái /
 *  khoảng thời gian, phân trang, kèm tên khách + số dòng hàng. */
export function list(opts: ListOrdersOptions = {}): OrderListResult {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const params: unknown[] = []
  const search = opts.search?.trim()
  if (search) {
    where.push(`(CAST(o.invoice_no AS TEXT) LIKE ? OR c.name LIKE ?)`)
    params.push(`%${search}%`, `%${search}%`)
  }
  if (opts.status !== undefined && opts.status !== 'all') {
    where.push('o.status = ?')
    params.push(opts.status)
  }
  if (opts.from != null) {
    where.push('o.created_at >= ?')
    params.push(opts.from)
  }
  if (opts.to != null) {
    where.push('o.created_at < ?')
    params.push(opts.to)
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const base = `
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    ${clause}
  `
  const total = (
    prepare(`SELECT COUNT(*) AS n ${base}`).get(...params) as { n: number }
  ).n
  const items = prepare(
    `SELECT o.*,
            c.name AS customer_name,
            (SELECT COUNT(*) FROM order_details od WHERE od.order_id = o.id) AS item_count
     ${base}
     ORDER BY o.created_at DESC, o.id DESC
     LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Order[]

  return { items, total, page, pageSize }
}

// ----------------------------------------------------------------------------
// VietQR tĩnh (P1.6 — bước 1 khả thi offline của "QR thông báo tiền về")
// ----------------------------------------------------------------------------
// Sinh chuỗi payload EMVCo theo chuẩn VietQR (NPC A000000727):
//   00=01, 01=11 (QR tĩnh), 38={00: A000000727, 01: BIN+STK}, 53=704 (VND),
//   54=số tiền (đồng), 58=VN, 62={08: nội dung CK}, 63=CRC16-CCITT-FALSE.
// Webhook đối soát tự động (bước 2) cần dịch vụ ngoài — ngoài phạm vi P1.
// UI render hình QR (thư viện renderer) và lưu mã giao dịch vào
// order_payments.reference là việc của phase tích hợp.

function tlv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0')
  return `${id}${len}${value}`
}

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) — chuẩn CRC của EMVCo QR. */
function crc16ccitt(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/** Sinh chuỗi payload QR tĩnh VietQR. Ném lỗi nếu BIN/STK không hợp lệ. */
export function buildVietQRPayload(params: VietQRParams): string {
  const bankBin = params.bankBin?.trim() ?? ''
  const accountNo = params.accountNo?.replace(/\s+/g, '') ?? ''
  if (!/^\d{6}$/.test(bankBin)) {
    throw new Error('Mã BIN ngân hàng phải gồm 6 chữ số (VD: 970422).')
  }
  if (!/^[A-Za-z0-9]{6,19}$/.test(accountNo)) {
    throw new Error('Số tài khoản nhận tiền không hợp lệ (6–19 chữ/số).')
  }
  let amountDong: string | undefined
  if (params.amount_cents != null) {
    requireInt(params.amount_cents, 'Số tiền QR')
    if (params.amount_cents < 0) throw new Error('Số tiền QR không được âm.')
    amountDong = String(Math.floor(params.amount_cents / 100))
  }
  const description = (params.description ?? '').trim()

  const merchant = tlv('00', 'A000000727') + tlv('01', (bankBin + accountNo).toUpperCase())
  let payload = tlv('00', '01') + tlv('01', '11') + tlv('38', merchant) + tlv('53', '704')
  if (amountDong != null) payload += tlv('54', amountDong)
  payload += tlv('58', 'VN')
  // Nội dung CK nên là mã hóa đơn (số) để đối soát; chuỗi có dấu tiếng Việt
  // tùy thuộc ngân hàng hiển thị.
  if (description) payload += tlv('62', tlv('08', description))
  payload += '6304'
  return payload + crc16ccitt(payload)
}
