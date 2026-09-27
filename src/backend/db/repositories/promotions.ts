// ============================================================================
//  Postie POS - Promotions & vouchers repository (roadmap P2.1 — khuyến mại)
// ----------------------------------------------------------------------------
//  promotions: các chương trình giảm giá áp dụng khi bán
//    type 0 = giảm % toàn đơn (per-mille), 1 = giảm số tiền cố định toàn đơn
//    type 2 = giảm % theo dòng,           3 = giảm số tiền cố định theo dòng
//  vouchers: mã giảm giá đơn-lần nhập ở bước thanh toán; "đốt" bằng
//    used_order_id/used_at; void/trả-hàng-đủ-đơn nhả mã (NULL cả 2 cột —
//    xem comment bảng vouchers trong db/schema.sql).
//
//  Engine resolveCartDiscounts() được orders.create/hold gọi TRƯỚC khi tính
//  tổng. Giảm giá theo dòng gộp vào order_details.discount_amount (snapshot),
//  giảm giá toàn đơn gộp vào orders.discount_amount + orders.discount_reason
//  (snapshot) — đúng nguyên tắc "past invoices are immutable".
//
//  Ngữ nghĩa scope_json (PromotionScope):
//    - customer_ids: đơn phải thuộc một khách trong danh sách.
//    - min_order_cents: tổng tiền hàng sau giảm giá theo dòng (chưa thuế)
//      của đơn phải >= ngưỡng.
//    - product_ids / category_ids:
//        + type 2/3 (theo dòng): chỉ các dòng khớp được giảm (khớp nếu nằm
//          trong product_ids HOẶC category_ids).
//        + type 0/1 (toàn đơn): đơn chỉ cần chứa >= 1 dòng khớp, giảm giá
//          áp dụng cho cả đơn.
//    - Nhiều CTKM áp dụng đồng thời: KM THEO DÒNG áp trước (theo thứ tự id),
//      sau đó KM TOÀN ĐƠN tính trên phần còn lại sau TẤT CẢ giảm giá theo
//      dòng (theo thứ tự id); tổng giảm giá theo dòng không vượt giá trị dòng.
//    - min_order_cents so với tổng tiền hàng sau giảm giá theo dòng THỦ CÔNG
//      (chưa gồm KM dòng khác, chưa thuế) — "chi tiêu thực" của khách.
// ============================================================================

import { prepare } from '../connection.js'
import type {
  CreatePromotionInput,
  CreateVoucherInput,
  Promotion,
  PromotionScope,
  PromotionType,
  Voucher
} from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ — CHƯA có trong src/shared/types.ts (phase tích hợp sẽ bổ
// sung; liệt kê trong missingTypes của WorkResult).
// ----------------------------------------------------------------------------

export interface EvaluateCartParams {
  items: Array<{ product_id: number; quantity: number; unit_price: number; discount_amount?: number }>
  customer_id?: number | null
  /** Chỉ đánh giá các CTKM này (UI chọn từ "Hộp quà"); bỏ qua = tất cả đang hiệu lực. */
  promotion_ids?: number[]
  /** Unix seconds; mặc định là hiện tại (tiện kiểm thử "giờ vàng"). */
  now?: number
}

/** Giảm giá thêm cho 1 dòng giỏ hàng, theo index trong mảng items. */
export interface PromotionLineDiscount {
  index: number
  discount_amount: number
}

export interface PromotionApplication {
  promotion: Promotion
  /** Số tiền giảm toàn đơn do CTKM này đóng góp (type 0/1). */
  order_discount: number
  /** Giảm theo dòng do CTKM này đóng góp (type 2/3). */
  line_discounts: PromotionLineDiscount[]
}

export interface CartDiscountResult {
  /** Giảm giá thêm theo dòng (mảng cùng chiều dài với items, cents). */
  line_extra_discounts: number[]
  /** Tổng giảm giá toàn đơn từ các CTKM (chưa gồm voucher/giảm giá thủ công). */
  order_discount: number
  applications: PromotionApplication[]
}

export interface CartPreviewResult extends CartDiscountResult {
  /** Voucher hợp lệ ứng với mã đã cho (nếu có); mã lỗi -> throw. */
  voucher: Voucher | null
  voucher_value: number
}

export interface ListPromotionsOptions {
  search?: string
  type?: PromotionType
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export interface ListVouchersOptions {
  search?: string
  activeOnly?: boolean
  /** Chỉ hiện voucher chưa dùng (used_order_id IS NULL). */
  unusedOnly?: boolean
  page?: number
  pageSize?: number
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

const now = (): number => Math.floor(Date.now() / 1000)

function parseScope(json: string | null): PromotionScope | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as PromotionScope
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function hydrate(row: Promotion): Promotion {
  return { ...row, scope: parseScope(row.scope_json) }
}

function requirePositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} phải là số nguyên dương.`)
  }
}

// ----------------------------------------------------------------------------
// promotions CRUD
// ----------------------------------------------------------------------------

/** Chuẩn hóa scope thành JSON lưu DB; scope rỗng -> NULL (áp dụng mọi đơn). */
function sanitizeScope(scope: PromotionScope | null | undefined): string | null {
  if (scope == null) return null
  const out: PromotionScope = {}
  const intArray = (v: unknown): number[] | undefined => {
    if (!Array.isArray(v) || v.length === 0) return undefined
    const arr = v.map(Number).filter(n => Number.isInteger(n))
    return arr.length ? arr : undefined
  }
  out.product_ids = intArray(scope.product_ids)
  out.category_ids = intArray(scope.category_ids)
  out.customer_ids = intArray(scope.customer_ids)
  if (scope.min_order_cents != null) {
    requirePositiveInt(scope.min_order_cents, 'min_order_cents')
    out.min_order_cents = scope.min_order_cents
  }
  const hasAny =
    (out.product_ids?.length ?? 0) > 0 ||
    (out.category_ids?.length ?? 0) > 0 ||
    (out.customer_ids?.length ?? 0) > 0 ||
    out.min_order_cents != null
  return hasAny ? JSON.stringify(out) : null
}

function validateTypeValue(type: number, value: number): void {
  if (type !== 0 && type !== 1 && type !== 2 && type !== 3) {
    throw new Error('Loại khuyến mại không hợp lệ (0=% toàn đơn, 1=fixed toàn đơn, 2=% dòng, 3=fixed dòng).')
  }
  requirePositiveInt(value, 'Giá trị khuyến mại')
  // Mirror CHECK của bảng promotions trong schema.sql.
  if ((type === 0 || type === 2) && value > 10000) {
    throw new Error('Khuyến mại theo % tối đa 10000‰ (tương đương 100%).')
  }
}

export function listPromotions(opts: ListPromotionsOptions = {}): PagedResult<Promotion> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const params: unknown[] = []
  if (opts.search) {
    where.push('name LIKE ?')
    params.push(`%${opts.search}%`)
  }
  if (opts.type != null) {
    where.push('type = ?')
    params.push(opts.type)
  }
  if (opts.activeOnly) where.push('is_active = 1')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = (prepare(`SELECT COUNT(*) AS c FROM promotions ${clause}`).get(...params) as { c: number }).c
  const items = (prepare(
    `SELECT * FROM promotions ${clause} ORDER BY id LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Promotion[]).map(hydrate)

  return { items, total, page, pageSize }
}

export function getPromotionById(id: number): Promotion | undefined {
  const row = prepare(`SELECT * FROM promotions WHERE id = ?`).get(id) as Promotion | undefined
  return row ? hydrate(row) : undefined
}

export function createPromotion(input: CreatePromotionInput): Promotion {
  const name = input.name?.trim()
  if (!name) throw new Error('Tên chương trình khuyến mại không được để trống.')
  validateTypeValue(input.type, input.value)
  if (input.start_at != null && input.end_at != null && input.end_at < input.start_at) {
    throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.')
  }
  const info = prepare(`
    INSERT INTO promotions (name, type, value, scope_json, start_at, end_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(name, input.type, input.value, sanitizeScope(input.scope), input.start_at ?? null, input.end_at ?? null)
  return getPromotionById(Number(info.lastInsertRowid)) as Promotion
}

/** Partial update. `scope` gán trực tiếp (không merge với scope cũ). */
export function updatePromotion(
  id: number,
  input: Partial<CreatePromotionInput> & { is_active?: number }
): Promotion {
  const current = getPromotionById(id)
  if (!current) throw new Error(`Không tìm thấy chương trình khuyến mại #${id}.`)

  const name = input.name !== undefined ? input.name.trim() : current.name
  if (!name) throw new Error('Tên chương trình khuyến mại không được để trống.')
  const type = input.type ?? current.type
  const value = input.value ?? current.value
  validateTypeValue(type, value)

  let startAt = input.start_at !== undefined ? input.start_at : current.start_at
  let endAt = input.end_at !== undefined ? input.end_at : current.end_at
  if (startAt != null && endAt != null && endAt < startAt) {
    throw new Error('Thời gian kết thúc phải sau thời gian bắt đầu.')
  }
  const scopeJson = input.scope !== undefined ? sanitizeScope(input.scope) : current.scope_json
  const isActive = input.is_active ?? current.is_active

  prepare(`
    UPDATE promotions
       SET name = ?, type = ?, value = ?, scope_json = ?, start_at = ?, end_at = ?, is_active = ?
     WHERE id = ?
  `).run(name, type, value, scopeJson, startAt ?? null, endAt ?? null, isActive, id)
  return getPromotionById(id) as Promotion
}

/** Soft-delete theo is_active — giữ lịch sử cho các đơn đã áp dụng. */
export function deactivatePromotion(id: number): Promotion {
  return updatePromotion(id, { is_active: 0 })
}

// ----------------------------------------------------------------------------
// vouchers CRUD + redemption
// ----------------------------------------------------------------------------

export function listVouchers(opts: ListVouchersOptions = {}): PagedResult<Voucher> {
  const page = Math.max(1, opts.page ?? 1)
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50))
  const offset = (page - 1) * pageSize

  const where: string[] = []
  const params: unknown[] = []
  if (opts.search) {
    where.push('code LIKE ?')
    params.push(`%${opts.search}%`)
  }
  if (opts.activeOnly) where.push('is_active = 1')
  if (opts.unusedOnly) where.push('used_order_id IS NULL')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = (prepare(`SELECT COUNT(*) AS c FROM vouchers ${clause}`).get(...params) as { c: number }).c
  const items = prepare(
    `SELECT * FROM vouchers ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as Voucher[]

  return { items, total, page, pageSize }
}

export function getVoucherById(id: number): Voucher | undefined {
  return prepare(`SELECT * FROM vouchers WHERE id = ?`).get(id) as Voucher | undefined
}

export function createVoucher(input: CreateVoucherInput): Voucher {
  const code = input.code?.trim()
  if (!code) throw new Error('Mã voucher không được để trống.')
  requirePositiveInt(input.value_cents, 'Giá trị voucher')
  if (input.expires_at != null) {
    if (!Number.isInteger(input.expires_at)) throw new Error('Hạn sử dụng voucher không hợp lệ.')
    if (input.expires_at <= now()) throw new Error('Hạn sử dụng voucher phải ở tương lai.')
  }
  const info = prepare(`
    INSERT INTO vouchers (code, value_cents, expires_at, is_active)
    VALUES (?, ?, ?, 1)
  `).run(code, input.value_cents, input.expires_at ?? null)
  return getVoucherById(Number(info.lastInsertRowid)) as Voucher
}

export function deactivateVoucher(id: number): Voucher {
  const current = getVoucherById(id)
  if (!current) throw new Error(`Không tìm thấy voucher #${id}.`)
  prepare(`UPDATE vouchers SET is_active = 0 WHERE id = ?`).run(id)
  return getVoucherById(id) as Voucher
}

/**
 * Tra cứu voucher để áp dụng (bước thanh toán / preview). Throw với thông điệp
 * tiếng Việt nếu mã không tồn tại / đã vô hiệu / hết hạn / đã dùng.
 * `allowUsedByOrderId`: voucher đã "đốt" bởi chính đơn này vẫn được coi là
 * dùng được (dùng khi sửa đơn treo giữ nguyên mã).
 */
export function findVoucherForRedemption(
  code: string,
  opts: { now?: number; allowUsedByOrderId?: number } = {}
): Voucher {
  const trimmed = code.trim()
  if (!trimmed) throw new Error('Vui lòng nhập mã voucher.')
  // cột code COLLATE NOCASE nên So Sánh = không phân biệt hoa/thường.
  const row = prepare(`SELECT * FROM vouchers WHERE code = ?`).get(trimmed) as Voucher | undefined
  if (!row) throw new Error(`Không tìm thấy voucher "${trimmed}".`)
  if (!row.is_active) throw new Error('Voucher đã bị vô hiệu hóa.')
  const at = opts.now ?? now()
  if (row.expires_at != null && row.expires_at < at) throw new Error('Voucher đã hết hạn.')
  if (row.used_order_id != null && row.used_order_id !== opts.allowUsedByOrderId) {
    throw new Error('Voucher đã được sử dụng.')
  }
  return row
}

/**
 * "Đốt" voucher cho một đơn — PHẢI được gọi trong transaction của đơn
 * (orders.create/hold). Guard WHERE dùng_order_id IS NULL chống race giữa
 * 2 quầy cùng nhập một mã.
 */
export function redeemVoucher(voucherId: number, orderId: number, allowUsedByOrderId?: number): void {
  const info = prepare(`
    UPDATE vouchers
       SET used_order_id = ?, used_at = unixepoch()
     WHERE id = ? AND is_active = 1
       AND (used_order_id IS NULL OR used_order_id = ?)
  `).run(orderId, voucherId, allowUsedByOrderId ?? -1)
  if (Number(info.changes) !== 1) {
    throw new Error('Voucher không còn hiệu lực hoặc đã được sử dụng.')
  }
}

/** Nhả voucher của một đơn (hủy đơn / trả hàng đủ đơn) — idempotent. */
export function releaseVoucher(orderId: number): void {
  prepare(`UPDATE vouchers SET used_order_id = NULL, used_at = NULL WHERE used_order_id = ?`).run(orderId)
}

// ----------------------------------------------------------------------------
// Engine — đánh giá các CTKM đang hiệu lực trên một giỏ hàng
// ----------------------------------------------------------------------------

/** Load map product_id -> category_id cho các bộ lọc theo nhóm hàng. */
function loadCategoryMap(productIds: number[]): Map<number, number | null> {
  const map = new Map<number, number | null>()
  if (productIds.length === 0) return map
  const placeholders = productIds.map(() => '?').join(',')
  const rows = prepare(
    `SELECT id, category_id FROM products WHERE id IN (${placeholders})`
  ).all(...productIds) as Array<{ id: number; category_id: number | null }>
  for (const r of rows) map.set(r.id, r.category_id)
  return map
}

/** Các index dòng khớp bộ lọc product/category (OR). Không bộ lọc = mọi dòng. */
function matchingLineIndexes(
  scope: PromotionScope | null,
  items: EvaluateCartParams['items'],
  catMap: Map<number, number | null>
): number[] {
  const productFilter = scope?.product_ids?.length ? new Set(scope.product_ids) : null
  const categoryFilter = scope?.category_ids?.length ? new Set(scope.category_ids) : null
  if (!productFilter && !categoryFilter) return items.map((_, i) => i)
  const out: number[] = []
  items.forEach((item, i) => {
    const cat = catMap.get(item.product_id) ?? null
    const match =
      (productFilter?.has(item.product_id) ?? false) ||
      (categoryFilter != null && cat != null && categoryFilter.has(cat))
    if (match) out.push(i)
  })
  return out
}

/**
 * Chạy engine khuyến mại trên giỏ hàng (đọc promotions, KHÔNG ghi DB).
 * Hai lượt áp dụng: KM theo dòng trước (id tăng dần), sau đó KM toàn đơn
 * tính trên phần còn lại sau tất cả giảm giá theo dòng (id tăng dần).
 */
export function resolveCartDiscounts(params: EvaluateCartParams): CartDiscountResult {
  const items = params.items
  const at = params.now ?? now()
  const grossPerLine = items.map(i => i.unit_price * i.quantity)
  const manualPerLine = items.map(i => Math.max(0, i.discount_amount ?? 0))
  // "Chi tiêu" của đơn sau giảm giá theo dòng thủ công (chưa thuế) — dùng cho min_order.
  const spendPerLine = items.map((_, i) => Math.max(0, grossPerLine[i] - manualPerLine[i]))
  const subtotalSpend = spendPerLine.reduce((s, v) => s + v, 0)

  let rows = prepare(`
    SELECT * FROM promotions
     WHERE is_active = 1
       AND (start_at IS NULL OR start_at <= ?)
       AND (end_at   IS NULL OR end_at   >= ?)
     ORDER BY id
  `).all(at, at) as Promotion[]
  if (params.promotion_ids?.length) {
    const allow = new Set(params.promotion_ids)
    rows = rows.filter(r => allow.has(r.id))
  }

  const catMap = loadCategoryMap([...new Set(items.map(i => i.product_id))])

  const lineExtra = new Array<number>(items.length).fill(0)
  const applications: PromotionApplication[] = []

  const customerOk = (scope: PromotionScope | null): boolean =>
    !scope?.customer_ids?.length ||
    (params.customer_id != null && scope.customer_ids.includes(params.customer_id))

  // Lượt 1: KM theo dòng (type 2/3) — chỉ các dòng khớp scope được giảm.
  for (const row of rows) {
    if (row.type !== 2 && row.type !== 3) continue
    const scope = parseScope(row.scope_json)
    if (!customerOk(scope)) continue
    if (scope?.min_order_cents != null && subtotalSpend < scope.min_order_cents) continue

    const candidates = matchingLineIndexes(scope, items, catMap)
    if (candidates.length === 0) continue
    const lineDiscounts: PromotionLineDiscount[] = []
    for (const idx of candidates) {
      const room = grossPerLine[idx] - manualPerLine[idx] - lineExtra[idx]
      if (room <= 0) continue
      const extra =
        row.type === 2
          ? Math.min(room, Math.round((grossPerLine[idx] * row.value) / 10000))
          : Math.min(room, row.value)
      if (extra <= 0) continue
      lineExtra[idx] += extra
      lineDiscounts.push({ index: idx, discount_amount: extra })
    }
    if (lineDiscounts.length === 0) continue
    applications.push({ promotion: hydrate(row), order_discount: 0, line_discounts: lineDiscounts })
  }

  // Lượt 2: KM toàn đơn (type 0/1) — base = chi tiêu sau TẤT CẢ giảm giá dòng.
  let remainingOrderBase = subtotalSpend - lineExtra.reduce((s, v) => s + v, 0)
  for (const row of rows) {
    if (row.type !== 0 && row.type !== 1) continue
    const scope = parseScope(row.scope_json)
    if (!customerOk(scope)) continue
    if (scope?.min_order_cents != null && subtotalSpend < scope.min_order_cents) continue

    // Nếu scope lọc hàng/nhóm thì đơn phải chứa >= 1 dòng khớp.
    const hasLineFilter = (scope?.product_ids?.length ?? 0) > 0 || (scope?.category_ids?.length ?? 0) > 0
    if (hasLineFilter && matchingLineIndexes(scope, items, catMap).length === 0) continue
    if (remainingOrderBase <= 0) continue
    const d =
      row.type === 0
        ? Math.min(remainingOrderBase, Math.round((remainingOrderBase * row.value) / 10000))
        : Math.min(remainingOrderBase, row.value)
    if (d <= 0) continue
    remainingOrderBase -= d
    applications.push({ promotion: hydrate(row), order_discount: d, line_discounts: [] })
  }

  const orderDiscountTotal = applications.reduce((s, a) => s + a.order_discount, 0)
  return { line_extra_discounts: lineExtra, order_discount: orderDiscountTotal, applications }
}

/**
 * Preview cho UI ("Hộp quà" / ô voucher ở bước thanh toán): engine + kiểm tra
 * voucher (không "đốt"). Throw nếu voucher_code không hợp lệ.
 */
export function previewCartDiscounts(
  params: EvaluateCartParams & { voucher_code?: string }
): CartPreviewResult {
  const base = resolveCartDiscounts(params)
  let voucher: Voucher | null = null
  if (params.voucher_code) {
    voucher = findVoucherForRedemption(params.voucher_code, { now: params.now })
  }
  return { ...base, voucher, voucher_value: voucher?.value_cents ?? 0 }
}
