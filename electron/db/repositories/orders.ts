// ============================================================================
//  Postie POS - Orders repository
// ----------------------------------------------------------------------------
//  The create() function is the single most important transaction in the app:
//  it inserts the invoice header + line items + payments, decrements stock,
//  and records stock_movements — all atomically.
// ============================================================================

import { getDb } from '../connection.js'
import * as productsRepo from './products.js'
import type {
  CreateOrderInput,
  Order,
  OrderDetailRow,
  OrderPaymentRow,
  OrderStatus
} from '../../../src/shared/types.js'

/** Round cents safely (defensive — inputs should already be integers). */
function roundCents(n: number): number {
  return Math.round(n)
}

/**
 * Create a complete sale in one transaction.
 *
 * Steps:
 *   1. Generate invoice_no = MAX(invoice_no) + 1  (UNIQUE guards against races)
 *   2. Compute per-line tax_amount, subtotal, and order totals
 *   3. INSERT orders header
 *   4. INSERT order_details (price/tax snapshots)
 *   5. INSERT order_payments (split-tender)
 *   6. Decrement stock via stock_movements (trigger syncs products.stock)
 *   7. If credit sale (customer + unpaid remainder), INSERT customer_ledger
 *      (trigger syncs customers.balance)
 *   8. Return the full order with details + payments
 */
export function create(input: CreateOrderInput): Order {
  if (input.items.length === 0) {
    throw new Error('Cannot create an order with no items')
  }

  const db = getDb()
  const tx = db.transaction(() => {
    // 1. invoice_no
    const maxRow = db.prepare(`SELECT MAX(invoice_no) AS m FROM orders`).get() as { m: number | null } | undefined
    const invoiceNo = (maxRow?.m ?? 0) + 1

    // 2. Compute line + order totals
    let subtotalBeforeTax = 0
    let taxTotal = 0
    const detailRows: Array<{
      product_id: number
      unit_price: number
      quantity: number
      tax_rate: number
      tax_amount: number
      discount_amount: number
      subtotal: number
      note: string | null
    }> = []

    for (const item of input.items) {
      const lineGross = roundCents(item.unit_price * item.quantity)
      const lineDiscount = roundCents(item.discount_amount ?? 0)
      const taxableBase = Math.max(0, lineGross - lineDiscount)
      // tax_rate is per-mille (1000 = 10%), so divide by 10000 to get cents.
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
        note: item.note ?? null
      })
    }

    const orderDiscount = roundCents(input.discount_amount ?? 0)
    const total = Math.max(0, roundCents(subtotalBeforeTax + taxTotal - orderDiscount))
    const paidAmount = input.payments.reduce((s, p) => s + p.amount, 0)
    const status: OrderStatus = paidAmount >= total ? 1 : paidAmount > 0 ? 4 : 0

    // 3. INSERT orders
    const orderInfo = db.prepare(`
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
      subtotalBeforeTax,
      taxTotal,
      orderDiscount,
      total,
      paidAmount,
      status,
      input.discount_reason ?? null,
      input.note ?? null
    )
    const orderId = Number(orderInfo.lastInsertRowid)

    // 4. INSERT order_details
    const detailStmt = db.prepare(`
      INSERT INTO order_details
        (order_id, product_id, unit_price, quantity, tax_rate, tax_amount, discount_amount, subtotal, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    for (const d of detailRows) {
      detailStmt.run(
        orderId, d.product_id, d.unit_price, d.quantity, d.tax_rate,
        d.tax_amount, d.discount_amount, d.subtotal, d.note
      )
    }

    // 5. INSERT order_payments
    const payStmt = db.prepare(`
      INSERT INTO order_payments (order_id, payment_method_id, amount, reference)
      VALUES (?, ?, ?, ?)
    `)
    for (const p of input.payments) {
      payStmt.run(orderId, p.payment_method_id, p.amount, p.reference ?? null)
    }

    // 6. Decrement stock + record movements (re-use products repo for the tx)
    for (const d of detailRows) {
      productsRepo.adjustStock({
        productId: d.product_id,
        delta: -d.quantity,
        type: 0, // sale
        orderId,
        note: `Sale #${invoiceNo}`,
        userId: input.user_id
      })
    }

    // 7. Credit sale: if a customer is attached and they still owe money,
    //    record a customer_ledger entry. The trigger updates customers.balance.
    const owed = total - paidAmount
    if (input.customer_id && owed > 0) {
      db.prepare(`
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

    // 8. Return the full order
    return getById(orderId) as Order
  })

  return tx()
}

/** Fetch an order with its details + payments. */
export function getById(id: number): Order | undefined {
  const db = getDb()
  const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as Order | undefined
  if (!order) return undefined
  order.details = db.prepare(`SELECT * FROM order_details WHERE order_id = ? ORDER BY id`).all(id) as OrderDetailRow[]
  order.payments = db.prepare(`SELECT * FROM order_payments WHERE order_id = ? ORDER BY id`).all(id) as OrderPaymentRow[]
  return order
}

/** List recent orders (header only). */
export function listRecent(limit = 50): Order[] {
  return getDb().prepare(
    `SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(limit) as Order[]
}

/** List orders belonging to a shift (header only, newest first). */
export function listByShift(shiftId: number, limit = 200): Order[] {
  return getDb().prepare(
    `SELECT * FROM orders WHERE shift_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(shiftId, limit) as Order[]
}
