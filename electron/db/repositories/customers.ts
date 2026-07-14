// ============================================================================
//  Postie POS - Customers repository (credit sales / debt tracking)
// ----------------------------------------------------------------------------
//  customers.balance is a DERIVED column kept in sync with customer_ledger by
//  the trg_ledger_after_insert trigger. To change a balance, INSERT a
//  customer_ledger row — never UPDATE customers.balance directly.
// ============================================================================

import { getDb } from '../connection.js'
import type {
  Customer,
  CustomerLedgerEntry,
  CustomerLedgerType
} from '../../../src/shared/types.js'

export interface ListCustomersOptions {
  search?: string
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export interface CustomerListResult {
  items: Customer[]
  total: number
  page: number
  pageSize: number
}

/** List customers with optional search + pagination. */
export function list(opts: ListCustomersOptions = {}): CustomerListResult {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const params: unknown[] = []
  if (opts.search) {
    where.push('(name LIKE ? OR phone LIKE ?)')
    params.push(`%${opts.search}%`, `%${opts.search}%`)
  }
  if (opts.activeOnly) where.push('is_active = 1')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const db = getDb()
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM customers ${clause}`).get(...params) as { c: number }).c
  const items = db.prepare(
    `SELECT * FROM customers ${clause} ORDER BY name LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Customer[]

  return { items, total, page, pageSize }
}

export function getById(id: number): Customer | undefined {
  return getDb().prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as Customer | undefined
}

export function getByPhone(phone: string): Customer | undefined {
  return getDb().prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer | undefined
}

export interface CreateCustomerInput {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

export function create(input: CreateCustomerInput): Customer {
  const db = getDb()
  const info = db.prepare(`
    INSERT INTO customers (name, phone, email, address)
    VALUES (@name, @phone, @email, @address)
  `).run({
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null
  })
  return getById(Number(info.lastInsertRowid)) as Customer
}

/**
 * Record a customer payment (paying down debt). INSERTs a customer_ledger
 * row with a NEGATIVE amount (reduces balance). The trigger syncs balance.
 * Returns the updated customer.
 */
export function recordPayment(params: {
  customerId: number
  amount: number            // positive cents paid by the customer
  userId: number
  note?: string | null
}): Customer {
  if (params.amount <= 0) throw new Error('Payment amount must be positive')
  const db = getDb()
  db.prepare(`
    INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
    VALUES (?, 1, ?, NULL, ?, ?)
  `).run(
    params.customerId,
    -params.amount,           // negative => reduces balance
    params.note ?? 'Payment received',
    params.userId
  )
  return getById(params.customerId) as Customer
}

/**
 * Manual balance adjustment (e.g. write-off, correction). `amount` is signed:
 * positive increases debt, negative decreases it.
 */
export function adjustBalance(params: {
  customerId: number
  amount: number            // signed cents
  userId: number
  note: string
}): Customer {
  const db = getDb()
  db.prepare(`
    INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
    VALUES (?, 2, ?, NULL, ?, ?)
  `).run(
    params.customerId,
    params.amount,
    params.note,
    params.userId
  )
  return getById(params.customerId) as Customer
}

/** Return the full ledger (audit trail) for a customer, newest first. */
export function getLedger(customerId: number, limit = 100): CustomerLedgerEntry[] {
  return getDb().prepare(
    `SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(customerId, limit) as CustomerLedgerEntry[]
}

/** Used by type narrowing in callers; re-export for convenience. */
export type { CustomerLedgerType }
