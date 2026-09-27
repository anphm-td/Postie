// ============================================================================
//  Postie POS - Suppliers repository (nhà cung cấp + công nợ phải trả)
// ----------------------------------------------------------------------------
//  suppliers.balance (số tiền cửa hàng NỢ NCC) là cột DẪN XUẤT, được trigger
//  trg_supplier_ledger_after_insert (db/schema.sql:639-646) đồng bộ với
//  supplier_ledger. Muốn đổi balance phải INSERT một dòng supplier_ledger —
//  TUYỆT ĐỐI không UPDATE suppliers.balance trực tiếp.
//
//  Mirror của customers.ts (roadmap P1.2 — "sao chép pattern customers.ts"):
//    * type=0 nợ nhập    (+, tăng balance)
//    * type=1 trả NCC    (−, giảm balance)
//    * type=2 điều chỉnh (signed, bắt buộc có lý do)
//  Phiếu nhập (purchases.ts) tự INSERT supplier_ledger trong transaction của
//  nó — giống orders.ts tự INSERT customer_ledger.
// ============================================================================

import { getDb, prepare } from '../connection.js'
import type {
  Supplier,
  SupplierLedgerEntry,
  SupplierSummary,
  UpdateSupplierInput
} from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ (chưa có trong src/shared/types.ts — đã ghi vào missingTypes)
// ----------------------------------------------------------------------------

export interface ListSuppliersOptions {
  search?: string
  activeOnly?: boolean
  /** Chỉ NCC đang bị nợ (balance > 0), sắp theo nợ giảm dần. */
  onlyOwing?: boolean
  page?: number
  pageSize?: number
}

export interface SupplierListResult {
  items: Supplier[]
  total: number
  page: number
  pageSize: number
}

/** List NCC với tìm kiếm + lọc + phân trang (mặc định theo tên A-Z). */
export function list(opts: ListSuppliersOptions = {}): SupplierListResult {
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
  if (opts.onlyOwing) where.push('balance > 0')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // Công nợ view đưa NCC bị nợ nhiều nhất lên đầu; mặc định theo tên.
  const order = opts.onlyOwing ? 'balance DESC, name' : 'name'

  const total = (prepare(`SELECT COUNT(*) AS c FROM suppliers ${clause}`).get(...params) as { c: number }).c
  const items = prepare(
    `SELECT * FROM suppliers ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Supplier[]

  return { items, total, page, pageSize }
}

/** Tổng hợp cho header màn Nhà cung cấp (mirror customers.getSummary). */
export function getSummary(): SupplierSummary {
  return prepare(`
    SELECT
      COUNT(*)                                                          AS active_suppliers,
      COALESCE(SUM(CASE WHEN balance > 0 THEN 1 ELSE 0 END), 0)         AS debtor_count,
      COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)   AS total_payable
    FROM suppliers
    WHERE is_active = 1
  `).get() as SupplierSummary
}

export function getById(id: number): Supplier | undefined {
  return prepare(`SELECT * FROM suppliers WHERE id = ?`).get(id) as Supplier | undefined
}

export function getByPhone(phone: string): Supplier | undefined {
  return prepare(`SELECT * FROM suppliers WHERE phone = ?`).get(phone) as Supplier | undefined
}

/**
 * Guard chung cho mọi thao tác GHI sổ công nợ NCC (recordPayment/adjustBalance)
 * — mirror customers.ts requireWritableCustomer: NCC phải tồn tại và đang hoạt
 * động. supplier_ledger là sổ audit — dòng ghi nhầm cho NCC không tồn tại/đã
 * ẩn sẽ làm lệch tổng công nợ mà không ai thấy trên UI (getSummary chỉ tổng
 * hợp NCC is_active = 1). Ném lỗi tiếng Việt thay vì để FK/trigger SQLite ném
 * lỗi kỹ thuật.
 */
function requireWritableSupplier(id: number): Supplier {
  const supplier = getById(id)
  if (!supplier) {
    throw new Error(`Không tìm thấy nhà cung cấp #${id}.`)
  }
  if (!supplier.is_active) {
    throw new Error(
      `Nhà cung cấp "${supplier.name}" đã bị vô hiệu hóa — không thể ghi thêm sổ công nợ.`
    )
  }
  return supplier
}

export interface CreateSupplierInput {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

export function create(input: CreateSupplierInput): Supplier {
  const name = input.name.trim()
  if (!name) throw new Error('Tên nhà cung cấp không được để trống.')
  const info = prepare(`
    INSERT INTO suppliers (name, phone, email, address)
    VALUES (@name, @phone, @email, @address)
  `).run({
    name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null
  })
  return getById(Number(info.lastInsertRowid)) as Supplier
}

/** Partial update các trường thông tin. balance không bao giờ đụng tới ở đây. */
export function update(id: number, input: UpdateSupplierInput): Supplier {
  const sets: string[] = []
  const params: Record<string, unknown> = { id }
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('Tên nhà cung cấp không được để trống.')
    sets.push('name = @name')
    params.name = name
  }
  if (input.phone !== undefined) { sets.push('phone = @phone'); params.phone = input.phone?.trim() || null }
  if (input.email !== undefined) { sets.push('email = @email'); params.email = input.email?.trim() || null }
  if (input.address !== undefined) { sets.push('address = @address'); params.address = input.address?.trim() || null }
  if (input.is_active !== undefined) {
    if (input.is_active !== 0 && input.is_active !== 1) throw new Error('is_active chỉ nhận 0 hoặc 1.')
    sets.push('is_active = @is_active')
    params.is_active = input.is_active
  }

  if (sets.length === 0) return getById(id) as Supplier
  sets.push('updated_at = unixepoch()')
  prepare(`UPDATE suppliers SET ${sets.join(', ')} WHERE id = @id`).run(params)
  return getById(id) as Supplier
}

/**
 * Soft-delete (giữ ledger + lịch sử phiếu nhập). Chặn khi NCC còn nợ để công nợ
 * không bị giấu đi — trả hết hoặc dùng "Điều chỉnh công nợ" trước.
 */
export function deactivate(id: number): Supplier {
  const existing = getById(id)
  if (!existing) throw new Error('Không tìm thấy nhà cung cấp.')
  if ((existing.balance ?? 0) !== 0) {
    throw new Error(
      'Không thể vô hiệu hóa nhà cung cấp còn công nợ. Hãy trả hết nợ hoặc dùng "Điều chỉnh công nợ" trước.'
    )
  }
  prepare(`UPDATE suppliers SET is_active = 0, updated_at = unixepoch() WHERE id = ?`).run(id)
  return getById(id) as Supplier
}

/**
 * Trả tiền NCC (giảm công nợ). INSERT supplier_ledger type=1 với số âm —
 * trigger tự cập nhật suppliers.balance. Trả vượt nợ được phép (balance âm =
 * trả trước/ ứng trước cho NCC). Nếu có `poId`, tiền được đối chiếu vào
 * purchase_orders.paid của phiếu đó.
 */
export function recordPayment(params: {
  supplierId: number
  amount: number            // cents > 0
  userId: number
  note?: string | null
  poId?: number | null      // đối chiếu thanh toán vào một phiếu nhập
}): Supplier {
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    throw new Error('Số tiền trả NCC phải là số nguyên dương (cents).')
  }
  requireWritableSupplier(params.supplierId)
  if (params.poId != null) {
    const po = prepare(`SELECT id, supplier_id, status FROM purchase_orders WHERE id = ?`)
      .get(params.poId) as { id: number; supplier_id: number; status: number } | undefined
    if (!po) throw new Error('Không tìm thấy phiếu nhập để đối chiếu thanh toán.')
    if (po.supplier_id !== params.supplierId) {
      throw new Error('Phiếu nhập không thuộc nhà cung cấp này.')
    }
    // Phiếu ĐÃ HỦY (status=2) không nhận thêm thanh toán — cột paid của nó chỉ
    // còn ý nghĩa là tiền cọc đã trả trước khi hủy (purchases.cancel giữ nguyên
    // paid để đối chiếu tiền cọc NCC nợ lại). Cộng thêm sẽ "đã trả" tiền vào
    // phiếu không còn giá trị nhập hàng.
    if (po.status === 2) {
      throw new Error(`Phiếu nhập #${po.id} đã bị hủy — không thể đối chiếu thêm thanh toán vào phiếu hủy.`)
    }
  }
  const db = getDb()
  db.transaction(() => {
    if (params.poId != null) {
      prepare(`UPDATE purchase_orders SET paid = paid + ? WHERE id = ?`).run(params.amount, params.poId)
    }
    prepare(`
      INSERT INTO supplier_ledger (supplier_id, type, amount, po_id, note, created_by)
      VALUES (?, 1, ?, ?, ?, ?)
    `).run(
      params.supplierId,
      -params.amount,          // âm => giảm balance (nợ ít đi)
      params.poId ?? null,
      params.note?.trim() || 'Trả tiền NCC tại quầy',
      params.userId
    )
  })()
  return getById(params.supplierId) as Supplier
}

/**
 * Điều chỉnh công nợ thủ công (ghi sổ lại). `amount` signed: dương
 * tăng nợ, âm giảm nợ. Bắt buộc có lý do để sổ cái có ý nghĩa kiểm toán.
 */
export function adjustBalance(params: {
  supplierId: number
  amount: number            // signed cents
  userId: number
  note: string
}): Supplier {
  if (!Number.isInteger(params.amount) || params.amount === 0) {
    throw new Error('Số điều chỉnh phải là số nguyên khác 0.')
  }
  const note = params.note.trim()
  if (!note) throw new Error('Vui lòng nhập lý do điều chỉnh công nợ.')
  requireWritableSupplier(params.supplierId)
  const db = getDb()
  db.transaction(() => {
    prepare(`
      INSERT INTO supplier_ledger (supplier_id, type, amount, po_id, note, created_by)
      VALUES (?, 2, ?, NULL, ?, ?)
    `).run(params.supplierId, params.amount, note, params.userId)
  })()
  return getById(params.supplierId) as Supplier
}

/**
 * Sổ cái công nợ của một NCC, mới nhất trước. LEFT JOIN purchase_orders để
 * dòng gắn phiếu nhập hiển thị được trạng thái phiếu.
 */
export function getLedger(supplierId: number, limit = 100): SupplierLedgerEntry[] {
  return prepare(`
    SELECT l.*, po.status AS po_status
      FROM supplier_ledger l
      LEFT JOIN purchase_orders po ON po.id = l.po_id
     WHERE l.supplier_id = ?
     ORDER BY l.created_at DESC, l.id DESC
     LIMIT ?
  `).all(supplierId, limit) as SupplierLedgerEntry[]
}
