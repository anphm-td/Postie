// ============================================================================
//  Postie POS - Products repository
// ============================================================================

import { getDb, prepare } from '../connection.js'
import type {
  Product,
  StockMovement,
  StockMovementType,
  ListProductsOptions,
  ProductListResult,
  CreateProductInput,
  UpdateProductInput
} from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ (chưa có trong src/shared/types.ts — đã ghi vào missingTypes)
// ----------------------------------------------------------------------------

/** Tổng hợp báo cáo tồn kho (P1.9 — giá trị kho + cảnh báo ngưỡng). */
export interface StockReportSummary {
  /** Số sản phẩm đang hoạt động. */
  product_count: number
  /** Giá trị kho = SUM(stock × cost) của sản phẩm đang hoạt động (cents). */
  stock_value_cents: number
  low_stock_count: number      // 0 < stock <= low_stock_alert
  out_of_stock_count: number   // stock <= 0
  /** Sắp tồn tăng dần — đầu vào cho "Đề xuất nhập". */
  low_stock: Product[]
  out_of_stock: Product[]
}

/** List products with optional search / category filter + pagination. */
export function list(opts: ListProductsOptions = {}): ProductListResult {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const params: unknown[] = []
  if (opts.search) {
    where.push('(name LIKE ? OR barcode LIKE ?)')
    params.push(`%${opts.search}%`, `%${opts.search}%`)
  }
  if (opts.categoryId != null) {
    where.push('category_id = ?')
    params.push(opts.categoryId)
  }
  if (opts.activeOnly) {
    where.push('is_active = 1')
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = (prepare(`SELECT COUNT(*) AS c FROM products ${clause}`).get(...params) as { c: number }).c
  const items = prepare(
    `SELECT * FROM products ${clause} ORDER BY name LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Product[]

  return { items, total, page, pageSize }
}

/** Get a single product by id. */
export function getById(id: number): Product | undefined {
  return prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Product | undefined
}

/** Get a single product by barcode (used at the POS register screen). */
export function getByBarcode(barcode: string): Product | undefined {
  return prepare(`SELECT * FROM products WHERE barcode = ?`).get(barcode) as Product | undefined
}

/**
 * Create a new product. Returns the created row.
 *
 * Tồn đầu KHÔNG ghi thẳng vào products.stock: cột này là dẫn xuất từ
 * stock_movements (trigger trg_stock_after_insert tự sync — db/schema.sql
 * §2.13), ghi thẳng sẽ làm SUM(movements.delta) ≠ stock và thẻ kho thiếu dòng
 * tồn đầu để đối chiếu. INSERT sản phẩm với stock=0 rồi ghi movement type=3
 * "Tồn đầu" (delta dương) nếu có tồn đầu.
 */
export function create(input: CreateProductInput): Product {
  const openingStock = input.stock ?? 0
  if (!Number.isInteger(openingStock) || openingStock < 0) {
    throw new Error('Tồn đầu phải là số nguyên không âm.')
  }
  if (openingStock > 0 && !Number.isInteger(input.created_by ?? NaN)) {
    throw new Error('Thiếu người tạo (created_by) — cần để ghi dòng tồn đầu vào thẻ kho.')
  }
  const db = getDb()
  const tx = db.transaction(() => {
    const stmt = prepare(`
      INSERT INTO products
        (barcode, name, category_id, supplier_id, price, cost, tax_id, unit, stock, low_stock_alert)
      VALUES (@barcode, @name, @category_id, @supplier_id, @price, @cost, @tax_id, @unit, @stock, @low_stock_alert)
    `)
    const info = stmt.run({
      barcode: input.barcode,
      name: input.name,
      category_id: input.category_id ?? null,
      supplier_id: input.supplier_id ?? null,
      price: input.price,
      cost: input.cost ?? 0,
      tax_id: input.tax_id ?? null,
      unit: input.unit ?? null,
      stock: 0, // dẫn xuất — tồn đầu ghi qua stock_movements bên dưới
      low_stock_alert: input.low_stock_alert ?? 0
    })
    const productId = Number(info.lastInsertRowid)
    if (openingStock > 0) {
      // Movement type=3 (điều chỉnh/tồn đầu) — trigger tự cộng products.stock.
      prepare(`
        INSERT INTO stock_movements (product_id, type, delta, note, created_by)
        VALUES (?, 3, ?, 'Tồn đầu', ?)
      `).run(productId, openingStock, input.created_by)
    }
    return getById(productId) as Product
  })
  return tx()
}

/**
 * Update an existing product's editable fields. All fields are optional; only
 * provided fields are changed. `stock` is NOT updated here (it is derived from
 * stock_movements — use adjustStock for that). Returns the updated row.
 */
export function update(id: number, input: UpdateProductInput): Product {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }
  if (input.barcode !== undefined) { sets.push('barcode = @barcode'); params.barcode = input.barcode }
  if (input.name !== undefined) { sets.push('name = @name'); params.name = input.name }
  if (input.category_id !== undefined) { sets.push('category_id = @category_id'); params.category_id = input.category_id }
  if (input.supplier_id !== undefined) { sets.push('supplier_id = @supplier_id'); params.supplier_id = input.supplier_id }
  if (input.price !== undefined) { sets.push('price = @price'); params.price = input.price }
  if (input.cost !== undefined) { sets.push('cost = @cost'); params.cost = input.cost }
  if (input.tax_id !== undefined) { sets.push('tax_id = @tax_id'); params.tax_id = input.tax_id }
  if (input.unit !== undefined) { sets.push('unit = @unit'); params.unit = input.unit }
  if (input.low_stock_alert !== undefined) { sets.push('low_stock_alert = @low_stock_alert'); params.low_stock_alert = input.low_stock_alert }
  if (input.is_active !== undefined) { sets.push('is_active = @is_active'); params.is_active = input.is_active }
  if (sets.length === 0) return getById(id) as Product
  sets.push('updated_at = unixepoch()')
  prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = @id`).run(params)
  return getById(id) as Product
}

/** Soft-delete a product by marking it inactive (preserves order history). */
export function deactivate(id: number): Product {
  return update(id, { is_active: 0 })
}

/**
 * Record a stock change by INSERTing a stock_movements row. The
 * `trg_stock_after_insert` trigger updates products.stock automatically, so
 * the two can never diverge — never UPDATE products.stock directly.
 *
 * `delta` is signed: negative for sales/wastage, positive for returns/receiving.
 *
 * Throws if the resulting stock would go negative (the trigger has already
 * applied the delta, so the transaction rolls back and no movement is kept).
 */
export function adjustStock(params: {
  productId: number
  delta: number
  type: StockMovementType
  orderId?: number | null
  note?: string | null
  userId: number
}): void {
  const db = getDb()
  const tx = db.transaction(() => {
    // INSERT only — the trigger syncs products.stock.
    prepare(`
      INSERT INTO stock_movements (product_id, type, delta, order_id, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      params.productId,
      params.type,
      params.delta,
      params.orderId ?? null,
      params.note ?? null,
      params.userId
    )
    // Guard against negative stock. The trigger has already applied the
    // delta; if it went below zero, throw so the whole transaction rolls
    // back (including the movement row).
    const row = prepare(`SELECT stock FROM products WHERE id = ?`).get(params.productId) as { stock: number } | undefined
    if (row && row.stock < 0) {
      throw new Error(`Stock would go negative for product ${params.productId}`)
    }
  })
  tx()
}

// ============================================================================
//  Mảng Kho bổ sung (P0.7/P1 — docs/kiotviet-roadmap.md)
// ============================================================================

/**
 * Điều chỉnh tồn kho THỦ CÔNG (type=3). `delta` signed: dương = cộng thêm,
 * âm = bớt ra. Bắt buộc có lý do để thẻ kho có ý nghĩa kiểm toán.
 * Tồn kho đổi qua INSERT stock_movements — trigger tự sync products.stock.
 */
export function manualAdjust(params: {
  productId: number
  delta: number
  userId: number
  note: string
}): Product {
  if (!Number.isInteger(params.delta) || params.delta === 0) {
    throw new Error('Số điều chỉnh phải là số nguyên khác 0.')
  }
  const note = params.note.trim()
  if (!note) throw new Error('Vui lòng nhập lý do điều chỉnh tồn kho.')
  adjustStock({ productId: params.productId, delta: params.delta, type: 3, note, userId: params.userId })
  return getById(params.productId) as Product
}

/**
 * Hao hụt / hàng hỏng / mất mát (type=4, delta âm). `qty` > 0. Chỉ thành công
 * nếu tồn đủ để trừ (guard tồn âm trong adjustStock rollback cả movement).
 */
export function wastage(params: {
  productId: number
  qty: number
  userId: number
  note?: string | null
}): Product {
  if (!Number.isInteger(params.qty) || params.qty <= 0) {
    throw new Error('Số lượng hao hụt phải là số nguyên dương.')
  }
  adjustStock({
    productId: params.productId,
    delta: -params.qty,
    type: 4,
    note: params.note?.trim() || 'Hao hụt',
    userId: params.userId
  })
  return getById(params.productId) as Product
}

/**
 * Thẻ kho — toàn bộ lịch sử thay đổi tồn của một sản phẩm, mới nhất trước
 * (dùng idx_stock_movements_prod_time, db/schema.sql:562). Join tên nhân viên
 * và số hóa đơn khi movement gắn với đơn bán.
 */
export function listMovements(productId: number, limit = 200): StockMovement[] {
  return prepare(`
    SELECT m.*, u.display_name AS user_name, o.invoice_no
      FROM stock_movements m
      LEFT JOIN users u ON u.id = m.created_by
      LEFT JOIN orders o ON o.id = m.order_id
     WHERE m.product_id = ?
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ?
  `).all(productId, limit) as StockMovement[]
}

/**
 * Cảnh báo tồn thấp — so sánh ngay trong SQL (roadmap P1.9: "cảnh báo ngưỡng
 * là đủ, bỏ dự báo AI"). Gồm: 0 < stock <= low_stock_alert (sắp hết) và
 * stock <= 0 (hết hàng). Chỉ tính sản phẩm đang hoạt động.
 */
export function listLowStock(): Product[] {
  return prepare(`
    SELECT * FROM products
     WHERE is_active = 1
       AND ((low_stock_alert > 0 AND stock > 0 AND stock <= low_stock_alert)
            OR stock <= 0)
     ORDER BY stock ASC, name ASC
  `).all() as Product[]
}

/** Báo cáo tồn kho: giá trị kho (SUM stock×cost) + hai danh sách cảnh báo. */
export function getStockReport(): StockReportSummary {
  const totals = prepare(`
    SELECT COUNT(*)                AS product_count,
           COALESCE(SUM(stock * cost), 0) AS stock_value_cents
      FROM products
     WHERE is_active = 1
  `).get() as { product_count: number; stock_value_cents: number }

  const outOfStock = prepare(`
    SELECT * FROM products WHERE is_active = 1 AND stock <= 0 ORDER BY stock ASC, name ASC
  `).all() as Product[]
  const lowStock = (prepare(`
    SELECT * FROM products
     WHERE is_active = 1 AND low_stock_alert > 0 AND stock > 0 AND stock <= low_stock_alert
     ORDER BY stock ASC, name ASC
  `).all() as Product[])

  return {
    product_count: totals.product_count,
    stock_value_cents: totals.stock_value_cents,
    low_stock_count: lowStock.length,
    out_of_stock_count: outOfStock.length,
    low_stock: lowStock,
    out_of_stock: outOfStock
  }
}
