// ============================================================================
//  Postie POS - Products repository
// ============================================================================

import { getDb } from '../connection.js'
import type {
  Product,
  StockMovementType,
  ListProductsOptions,
  ProductListResult,
  CreateProductInput,
  UpdateProductInput
} from '../../../src/shared/types.js'

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

  const db = getDb()
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM products ${clause}`).get(...params) as { c: number }).c
  const items = db.prepare(
    `SELECT * FROM products ${clause} ORDER BY name LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Product[]

  return { items, total, page, pageSize }
}

/** Get a single product by id. */
export function getById(id: number): Product | undefined {
  return getDb().prepare(`SELECT * FROM products WHERE id = ?`).get(id) as Product | undefined
}

/** Get a single product by barcode (used at the POS register screen). */
export function getByBarcode(barcode: string): Product | undefined {
  return getDb().prepare(`SELECT * FROM products WHERE barcode = ?`).get(barcode) as Product | undefined
}

/** Create a new product. Returns the created row. */
export function create(input: CreateProductInput): Product {
  const db = getDb()
  const stmt = db.prepare(`
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
    stock: input.stock ?? 0,
    low_stock_alert: input.low_stock_alert ?? 0
  })
  return getById(Number(info.lastInsertRowid)) as Product
}

/**
 * Update an existing product's editable fields. All fields are optional; only
 * provided fields are changed. `stock` is NOT updated here (it is derived from
 * stock_movements — use adjustStock for that). Returns the updated row.
 */
export function update(id: number, input: UpdateProductInput): Product {
  const db = getDb()
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
  db.prepare(`UPDATE products SET ${sets.join(', ')} WHERE id = @id`).run(params)
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
    db.prepare(`
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
    const row = db.prepare(`SELECT stock FROM products WHERE id = ?`).get(params.productId) as { stock: number } | undefined
    if (row && row.stock < 0) {
      throw new Error(`Stock would go negative for product ${params.productId}`)
    }
  })
  tx()
}
