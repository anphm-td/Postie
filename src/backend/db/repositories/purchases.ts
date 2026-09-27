// ============================================================================
//  Postie POS - Purchases repository (phiếu nhập hàng / đặt hàng nhập từ NCC)
// ----------------------------------------------------------------------------
//  Vòng đời phiếu (db/schema.sql:334-361):
//    status 0 = chờ giao  --receive()-->  1 = đã nhập
//         |--cancel()--> 2 = đã hủy (hủy phiếu dùng status, KHÔNG DELETE)
//
//  Mỗi lần receive() chạy trong MỘT transaction:
//    1. INSERT stock_movements (type=2, delta=+qty, note='PO#<id>') — trigger
//       trg_stock_after_insert tự cộng products.stock; không UPDATE stock.
//    2. UPDATE products.cost = đơn giá dòng phiếu (giá vốn khi nhập — P1.2).
//    3. INSERT supplier_ledger type=0 (+giá trị đã nhận) — trigger
//       trg_supplier_ledger_after_insert tự cộng suppliers.balance; nếu trả
//       tiền ngay thì thêm một dòng type=1 (−paid) và UPDATE purchase_orders.paid.
//       (Tách hai dòng thay vì một dòng "phần chưa trả" hỗn hợp để tiền trả
//       trước/cọc trước khi nhận hàng vẫn đúng nghĩa từng dòng sổ cái.)
//    4. Nhận đủ mọi mặt hàng => UPDATE status = 1.
//
//  NHẬN MỘT PHẦN: schema không có cột received_qty, nên số ĐÃ NHẬN được suy
//  ra từ stock_movements theo note quy ước 'PO#<id>' — chuỗi này chỉ do repo
//  này ghi cho movement type=2 (xem getReceivedLines). Hạn chế đã ghi nhận
//  trong notes của WorkResult; nếu cần tuyệt đối thì migrate thêm cột
//  received_qty vào purchase_order_details (ngoài quyền sở hữu file hiện tại).
// ============================================================================

import { getDb, prepare } from '../connection.js'
import * as productsRepo from './products.js'
import type {
  CreatePurchaseOrderInput,
  PurchaseOrder,
  PurchaseOrderDetailRow,
  PurchaseOrderStatus
} from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ (chưa có trong src/shared/types.ts — đã ghi vào missingTypes)
// ----------------------------------------------------------------------------

/** Một dòng nhận hàng: qty bỏ qua = nhận phần còn lại của mặt hàng đó. */
export interface ReceivePurchaseLine {
  detail_id: number
  qty?: number
}

export interface ReceivePurchaseInput {
  po_id: number
  /** Bỏ qua = nhận phần còn lại của TẤT CẢ các dòng. */
  lines?: ReceivePurchaseLine[]
  /** Số tiền trả NCC ngay lần nhận này (cents > 0). */
  paid?: number
  /** Người thực hiện nhận; mặc định = người tạo phiếu. */
  created_by?: number
}

export interface ListPurchaseOrdersOptions {
  supplier_id?: number
  status?: PurchaseOrderStatus
  limit?: number
}

export interface ReceivedLine {
  product_id: number
  received_qty: number
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Tạo phiếu (đặt hàng nhập) — status 0, CHỜ GIAO. Chưa đụng tới tồn kho hay
 * công nợ: hàng chưa về, nợ chỉ ghi khi nhận hàng. Nếu `paid` > 0 (đặt cọc /
 * trả trước) thì ghi ngay một dòng supplier_ledger type=1 (âm) — balance tạm
 * âm nghĩa là cửa hàng ứng trước cho NCC, bù lại khi nhận hàng.
 */
export function create(input: CreatePurchaseOrderInput): PurchaseOrder {
  if (!input.details || input.details.length === 0) {
    throw new Error('Phiếu nhập phải có ít nhất một dòng hàng.')
  }
  if (!Number.isInteger(input.supplier_id)) throw new Error('Thiếu nhà cung cấp.')
  const supplier = prepare(`SELECT id, is_active FROM suppliers WHERE id = ?`)
    .get(input.supplier_id) as { id: number; is_active: number } | undefined
  if (!supplier) throw new Error('Không tìm thấy nhà cung cấp.')
  if (!supplier.is_active) throw new Error('Nhà cung cấp đã bị vô hiệu hóa.')

  for (const d of input.details) {
    if (!Number.isInteger(d.qty) || d.qty <= 0) {
      throw new Error('Số lượng đặt phải là số nguyên dương.')
    }
    if (!Number.isInteger(d.cost) || d.cost < 0) {
      throw new Error('Đơn giá nhập phải là số nguyên không âm (cents).')
    }
    if (!productsRepo.getById(d.product_id)) {
      throw new Error(`Không tìm thấy sản phẩm #${d.product_id}.`)
    }
  }
  if (input.created_by == null || !Number.isInteger(input.created_by)) {
    throw new Error('Thiếu thông tin người tạo phiếu (created_by).')
  }
  const paid = input.paid ?? 0
  if (!Number.isInteger(paid) || paid < 0) {
    throw new Error('Số tiền trả NCC phải là số nguyên không âm (cents).')
  }
  const total = input.details.reduce((s, d) => s + d.qty * d.cost, 0)

  const db = getDb()
  const tx = db.transaction(() => {
    const info = prepare(`
      INSERT INTO purchase_orders (supplier_id, status, total, paid, note, created_by)
      VALUES (?, 0, ?, ?, ?, ?)
    `).run(input.supplier_id, total, paid, input.note ?? null, input.created_by)
    const poId = Number(info.lastInsertRowid)

    const detailStmt = prepare(`
      INSERT INTO purchase_order_details (po_id, product_id, qty, cost)
      VALUES (?, ?, ?, ?)
    `)
    for (const d of input.details) {
      detailStmt.run(poId, d.product_id, d.qty, d.cost)
    }

    if (paid > 0) {
      // Trả trước/cọc: giảm balance ngay (âm = cửa hàng ứng trước), đối chiếu
      // vào paid của phiếu để receiving sau chỉ ghi phần giá trị hàng nhận.
      prepare(`
        INSERT INTO supplier_ledger (supplier_id, type, amount, po_id, note, created_by)
        VALUES (?, 1, ?, ?, ?, ?)
      `).run(input.supplier_id, -paid, poId, `Trả trước/cọc PO#${poId}`, input.created_by)
    }
    return getById(poId) as PurchaseOrder
  })
  return tx()
}

/**
 * Nhận hàng từ NCC — một phần hoặc đủ, có thể nhận nhiều lần (phiếu còn
 * status 0). Mỗi lần là MỘT transaction: movements type=2 + cập nhật
 * products.cost + ghi công nợ + tự hoàn tất phiếu khi nhận đủ mọi mặt hàng.
 * Chặn nhận vượt số đã đặt. Nhận thêm hàng đã hết hàng (stock hiện tại 0)
 * vẫn hợp lệ vì delta dương.
 */
export function receive(params: ReceivePurchaseInput): PurchaseOrder {
  const db = getDb()
  const tx = db.transaction(() => {
    const po = prepare(`SELECT * FROM purchase_orders WHERE id = ?`)
      .get(params.po_id) as PurchaseOrder | undefined
    if (!po) throw new Error('Không tìm thấy phiếu nhập.')
    if (po.status !== 0) {
      throw new Error(`Phiếu nhập #${po.id} không ở trạng thái "chờ giao" (status=${po.status}).`)
    }
    const createdBy = params.created_by ?? po.created_by
    const details = prepare(
      `SELECT * FROM purchase_order_details WHERE po_id = ? ORDER BY id`
    ).all(po.id) as PurchaseOrderDetailRow[]
    if (details.length === 0) throw new Error('Phiếu nhập không có dòng hàng nào.')

    const poNote = `PO#${po.id}`
    const ordered = new Map<number, number>()
    for (const d of details) {
      ordered.set(d.product_id, (ordered.get(d.product_id) ?? 0) + d.qty)
    }
    const receivedBefore = new Map<number, number>()
    for (const r of getReceivedLines(po.id)) {
      receivedBefore.set(r.product_id, r.received_qty)
    }

    // Chọn các dòng cần nhận: từ `lines` (theo detail_id, qty bỏ qua = phần
    // còn lại của mặt hàng đó) hoặc mặc định = phần còn lại của mỗi MẶT HÀNG
    // (một phiếu có thể có nhiều dòng cùng mặt hàng — nhận gộp theo dòng đầu).
    const toReceive: Array<{ detail: PurchaseOrderDetailRow; qty: number }> = []
    if (params.lines && params.lines.length > 0) {
      const byId = new Map(details.map(d => [d.id, d]))
      for (const line of params.lines) {
        const detail = byId.get(line.detail_id)
        if (!detail) {
          throw new Error(`Dòng #${line.detail_id} không thuộc phiếu nhập #${po.id}.`)
        }
        const claimedForProduct = toReceive
          .filter(t => t.detail.product_id === detail.product_id)
          .reduce((s, t) => s + t.qty, 0)
        const remaining = Math.max(
          0,
          (ordered.get(detail.product_id) ?? 0) -
          (receivedBefore.get(detail.product_id) ?? 0) -
          claimedForProduct
        )
        const qty = line.qty ?? remaining
        if (qty <= 0) {
          // qty bỏ qua mà hết hạn ngạch => bỏ qua dòng; qty đưa vào <= 0 => lỗi.
          if (line.qty == null) continue
          throw new Error('Số lượng nhận phải là số nguyên dương.')
        }
        toReceive.push({ detail, qty })
      }
    } else {
      const claimed = new Set<number>()
      for (const d of details) {
        if (claimed.has(d.product_id)) continue
        const remaining =
          (ordered.get(d.product_id) ?? 0) - (receivedBefore.get(d.product_id) ?? 0)
        if (remaining > 0) {
          toReceive.push({ detail: d, qty: remaining })
          claimed.add(d.product_id)
        }
      }
    }
    if (toReceive.length === 0) {
      throw new Error('Không còn hàng nào cần nhập cho phiếu này.')
    }

    if (params.paid != null && params.paid > 0 && !Number.isInteger(params.paid)) {
      throw new Error('Số tiền trả NCC phải là số nguyên (cents).')
    }

    let receivedValue = 0
    const receivedNow = new Map<number, number>()
    for (const { detail, qty } of toReceive) {
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error('Số lượng nhận phải là số nguyên dương.')
      }
      const totalOrdered = ordered.get(detail.product_id) ?? 0
      const already = receivedBefore.get(detail.product_id) ?? 0
      if (already + qty > totalOrdered) {
        throw new Error(
          `Nhận vượt số đã đặt cho sản phẩm #${detail.product_id} (đã nhận ${already}/${totalOrdered}).`
        )
      }

      // 1. Cộng tồn kho — INSERT movement (trigger tự cộng products.stock).
      productsRepo.adjustStock({
        productId: detail.product_id,
        delta: qty,
        type: 2, // purchase
        note: poNote,
        userId: createdBy
      })
      // 2. Giá vốn khi nhập: đơn giá dòng phiếu trở thành products.cost.
      //    cost KHÔNG phải cột dẫn xuất nên UPDATE trực tiếp là đúng quy tắc.
      prepare(`UPDATE products SET cost = ?, updated_at = unixepoch() WHERE id = ?`)
        .run(detail.cost, detail.product_id)

      receivedValue += qty * detail.cost
      receivedNow.set(detail.product_id, (receivedNow.get(detail.product_id) ?? 0) + qty)
    }

    // 3. Công nợ: ghi nợ giá trị hàng nhận (+), rồi tách dòng trả tiền (−).
    if (receivedValue > 0) {
      prepare(`
        INSERT INTO supplier_ledger (supplier_id, type, amount, po_id, note, created_by)
        VALUES (?, 0, ?, ?, ?, ?)
      `).run(po.supplier_id, receivedValue, po.id, `Nhập hàng ${poNote}`, createdBy)
    }
    if (params.paid != null && params.paid > 0) {
      prepare(`
        INSERT INTO supplier_ledger (supplier_id, type, amount, po_id, note, created_by)
        VALUES (?, 1, ?, ?, ?, ?)
      `).run(po.supplier_id, -params.paid, po.id, `Trả tiền NCC ${poNote}`, createdBy)
      prepare(`UPDATE purchase_orders SET paid = paid + ? WHERE id = ?`).run(params.paid, po.id)
    }

    // 4. Nhận đủ mọi mặt hàng => hoàn tất phiếu.
    let complete = true
    for (const [productId, orderedQty] of ordered) {
      const totalReceived =
        (receivedBefore.get(productId) ?? 0) + (receivedNow.get(productId) ?? 0)
      if (totalReceived < orderedQty) { complete = false; break }
    }
    if (complete) {
      prepare(`UPDATE purchase_orders SET status = 1 WHERE id = ?`).run(po.id)
    }
    return getById(po.id) as PurchaseOrder
  })
  return tx()
}

/**
 * Hủy phiếu (status 0 -> 2). Chỉ hủy được phiếu chưa nhận hàng gì; tiền đã
 * trả trước (paid > 0) KHÔNG tự hoàn — xử lý qua suppliers.adjustBalance /
 * recordPayment và thể hiện là balance âm (NCC nợ lại tiền cọc).
 */
export function cancel(poId: number): PurchaseOrder {
  const db = getDb()
  const tx = db.transaction(() => {
    const po = prepare(`SELECT * FROM purchase_orders WHERE id = ?`).get(poId) as PurchaseOrder | undefined
    if (!po) throw new Error('Không tìm thấy phiếu nhập.')
    if (po.status !== 0) throw new Error('Chỉ hủy được phiếu ở trạng thái "chờ giao".')
    const received = getReceivedLines(poId).reduce((s, r) => s + r.received_qty, 0)
    if (received > 0) throw new Error('Phiếu đã nhận hàng — không thể hủy.')
    prepare(`UPDATE purchase_orders SET status = 2 WHERE id = ?`).run(poId)
    return getById(poId) as PurchaseOrder
  })
  return tx()
}

/** Số đã nhận theo mặt hàng của một phiếu (để UI hiển thị tiến độ giao). */
export function getReceivedLines(poId: number): ReceivedLine[] {
  return prepare(`
    SELECT product_id, COALESCE(SUM(delta), 0) AS received_qty
      FROM stock_movements
     WHERE type = 2 AND note = ?
     GROUP BY product_id
  `).all(`PO#${poId}`) as ReceivedLine[]
}

/** Lấy phiếu + chi tiết (join tên/barcode/đơn vị sản phẩm) + tên NCC. */
export function getById(id: number): PurchaseOrder | undefined {
  const po = prepare(`
    SELECT po.*, s.name AS supplier_name
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
     WHERE po.id = ?
  `).get(id) as PurchaseOrder | undefined
  if (!po) return undefined
  po.details = prepare(`
    SELECT d.*, p.name AS product_name, p.barcode AS barcode, p.unit AS unit
      FROM purchase_order_details d
      JOIN products p ON p.id = d.product_id
     WHERE d.po_id = ?
     ORDER BY d.id
  `).all(id) as PurchaseOrderDetailRow[]
  return po
}

/** List phiếu (mới nhất trước), lọc theo NCC / trạng thái. */
export function list(opts: ListPurchaseOrdersOptions = {}): PurchaseOrder[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.supplier_id != null) { where.push('po.supplier_id = ?'); params.push(opts.supplier_id) }
  if (opts.status != null) { where.push('po.status = ?'); params.push(opts.status) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100))
  return prepare(`
    SELECT po.*, s.name AS supplier_name
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id
      ${clause}
     ORDER BY po.created_at DESC, po.id DESC
     LIMIT ?
  `).all(...params, limit) as PurchaseOrder[]
}
