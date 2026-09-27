// ============================================================================
//  Postie POS - Customers repository (credit sales / debt tracking)
// ----------------------------------------------------------------------------
//  customers.balance is a DERIVED column kept in sync with customer_ledger by
//  the trg_ledger_after_insert trigger. To change a balance, INSERT a
//  customer_ledger row — never UPDATE customers.balance directly.
// ============================================================================

import { getDb, prepare } from '../connection.js'
import type {
  Customer,
  CustomerLedgerEntry,
  CustomerSummary,
  UpdateCustomerInput
} from '@shared/types'

export interface ListCustomersOptions {
  search?: string
  activeOnly?: boolean
  /** Only customers with balance > 0 (sorted by debt, largest first). */
  onlyDebtors?: boolean
  page?: number
  pageSize?: number
}

export interface CustomerListResult {
  items: Customer[]
  total: number
  page: number
  pageSize: number
}

/** List customers with optional search + filters + pagination. */
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
  if (opts.onlyDebtors) where.push('balance > 0')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // Debt view puts the biggest debtors first; the default view is alphabetical.
  const order = opts.onlyDebtors ? 'balance DESC, name' : 'name'

  const total = (prepare(`SELECT COUNT(*) AS c FROM customers ${clause}`).get(...params) as { c: number }).c
  const items = prepare(
    `SELECT * FROM customers ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Customer[]

  return { items, total, page, pageSize }
}

/** Header-card aggregates for the Customers/Debt screen. */
export function getSummary(): CustomerSummary {
  return prepare(`
    SELECT
      COUNT(*)                                                          AS active_customers,
      COALESCE(SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END), 0)         AS debtor_count,
      COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)   AS total_outstanding
    FROM customers
    WHERE is_active = 1
  `).get() as CustomerSummary
}

export function getById(id: number): Customer | undefined {
  return prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as Customer | undefined
}

/**
 * Guard chung cho mọi thao tác GHI sổ công nợ (recordPayment/adjustBalance):
 * khách phải tồn tại và đang hoạt động. customer_ledger là sổ audit — dòng
 * ledger ghi nhầm cho khách không tồn tại/đã ẩn sẽ làm lệch tổng công nợ mà
 * không ai nhìn thấy trên UI (list mặc định chỉ hiện khách is_active = 1).
 * Ném lỗi tiếng Việt thay vì để FK/trigger SQLite ném lỗi kỹ thuật.
 */
function requireWritableCustomer(id: number): Customer {
  const customer = getById(id)
  if (!customer) {
    throw new Error(`Không tìm thấy khách hàng #${id}.`)
  }
  if (!customer.is_active) {
    throw new Error(
      `Khách hàng "${customer.name}" đã bị vô hiệu hóa — không thể ghi thêm sổ công nợ.`
    )
  }
  return customer
}

export function getByPhone(phone: string): Customer | undefined {
  return prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer | undefined
}

export interface CreateCustomerInput {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

export function create(input: CreateCustomerInput): Customer {
  const name = input.name.trim()
  if (!name) throw new Error('Tên khách hàng không được để trống.')
  const info = prepare(`
    INSERT INTO customers (name, phone, email, address)
    VALUES (@name, @phone, @email, @address)
  `).run({
    name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null
  })
  return getById(Number(info.lastInsertRowid)) as Customer
}

/** Partial update of editable fields. Balance/points are never touched here. */
export function update(id: number, input: UpdateCustomerInput): Customer {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('Tên khách hàng không được để trống.')
    sets.push('name = @name')
    params.name = name
  }
  if (input.phone !== undefined) { sets.push('phone = @phone'); params.phone = input.phone?.trim() || null }
  if (input.email !== undefined) { sets.push('email = @email'); params.email = input.email?.trim() || null }
  if (input.address !== undefined) { sets.push('address = @address'); params.address = input.address?.trim() || null }

  if (sets.length === 0) return getById(id) as Customer
  sets.push('updated_at = unixepoch()')
  prepare(`UPDATE customers SET ${sets.join(', ')} WHERE id = @id`).run(params)
  return getById(id) as Customer
}

/**
 * Soft-delete (hide from lists while keeping ledger/order history intact).
 * Blocked while the customer still has a non-zero balance so debts can never
 * be hidden by deactivating their record.
 */
export function deactivate(id: number): Customer {
  const existing = getById(id)
  if (!existing) throw new Error('Không tìm thấy khách hàng.')
  if (existing.balance !== 0) {
    throw new Error(
      'Không thể vô hiệu hóa khách hàng còn dư nợ. Hãy thu hết nợ hoặc dùng "Điều chỉnh công nợ" trước.'
    )
  }
  prepare(`UPDATE customers SET is_active = 0, updated_at = unixepoch() WHERE id = ?`).run(id)
  return getById(id) as Customer
}

/**
 * Record a customer payment (paying down debt). INSERTs a customer_ledger
 * row with a NEGATIVE amount (reduces balance). The trigger syncs balance.
 * Amounts above the current balance are allowed on purpose — the balance goes
 * negative, meaning the STORE owes the customer (change/credit note).
 * Returns the updated customer.
 */
export function recordPayment(params: {
  customerId: number
  amount: number            // positive cents paid by the customer
  userId: number
  note?: string | null
}): Customer {
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    throw new Error('Số tiền thu phải là số nguyên dương.')
  }
  const db = getDb()
  db.transaction(() => {
    requireWritableCustomer(params.customerId)
    prepare(`
      INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
      VALUES (?, 1, ?, NULL, ?, ?)
    `).run(
      params.customerId,
      -params.amount,           // negative => reduces balance
      params.note ?? 'Thu nợ tại quầy',
      params.userId
    )
  })()
  return getById(params.customerId) as Customer
}

/**
 * Manual balance adjustment (e.g. write-off, correction). `amount` is signed:
 * positive increases debt, negative decreases it. A reason is required so the
 * audit trail stays meaningful.
 */
export function adjustBalance(params: {
  customerId: number
  amount: number            // signed cents
  userId: number
  note: string
}): Customer {
  if (!Number.isInteger(params.amount) || params.amount === 0) {
    throw new Error('Số điều chỉnh phải khác 0.')
  }
  const note = params.note.trim()
  if (!note) throw new Error('Vui lòng nhập lý do điều chỉnh.')
  const db = getDb()
  db.transaction(() => {
    requireWritableCustomer(params.customerId)
    prepare(`
      INSERT INTO customer_ledger (customer_id, type, amount, order_id, note, created_by)
      VALUES (?, 2, ?, NULL, ?, ?)
    `).run(params.customerId, params.amount, note, params.userId)
  })()
  return getById(params.customerId) as Customer
}

/**
 * Ledger (audit trail) for one customer, newest first. LEFT JOINs orders so
 * entries tied to an invoice can show the human-facing invoice_no.
 */
export function getLedger(customerId: number, limit = 100): CustomerLedgerEntry[] {
  return prepare(`
    SELECT l.*, o.invoice_no
      FROM customer_ledger l
      LEFT JOIN orders o ON o.id = l.order_id
     WHERE l.customer_id = ?
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ?
  `).all(customerId, limit) as CustomerLedgerEntry[]
}
