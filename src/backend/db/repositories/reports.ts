// ============================================================================
//  Postie POS - Reports repository (doanh thu / lợi nhuận / tồn kho)
// ----------------------------------------------------------------------------
//  Phạm vi theo docs/kiotviet-roadmap.md (mục 5–6):
//    * P0.6  — Báo cáo hiệu quả nhân viên (GROUP BY orders.user_id).
//    * P1.1  — Lợi nhuận từ SNAPSHOT giá vốn order_details.cost_cents.
//    * P1.9  — Lọc khoảng ngày, báo cáo theo phương thức thanh toán,
//              báo cáo tồn kho (tồn hiện tại + tồn thấp + giá trị kho).
//  Toàn bộ hàm là SELECT read-only — không mutation, không đổi schema.
//
//  Quy ước:
//  * "Doanh thu" = SUM(orders.total): sau giảm giá, GỒM thuế (khớp cách tính
//    hiện có của Reports.tsx: totalRevenue = SUM(o.total)).
//  * "Lợi nhuận gộp" = doanh thu − thuế − giá vốn (thuế GTGT là tiền thu hộ,
//    không phải lợi nhuận).
//  * Chỉ đếm đơn status IN (1, 4) (đã thanh toán / một phần) — cùng bộ lọc với
//    tiền mặt khi kết ca (shifts.ts close). Đơn hủy (2) và trả ĐỦ hàng (3)
//    không tính; trả MỘT PHẦN (đơn còn status 1/4) được trừ NET ở tầng này qua
//    returns/return_details (snapshot refund_amount + số lượng trả): doanh
//    thu, thuế, giá vốn và số lượng bán đều tính theo phần CHƯA trả — cùng
//    cách quy về đơn với cơ chế "đơn trả đủ tự rớt khỏi bộ lọc", nên doanh
//    thu không bị khai tăng bằng giá trị trả hàng.
//  * Giá vốn (COGS) lấy từ snapshot order_details.cost_cents để chốt đúng giá
//    vốn thời điểm bán. Khi snapshot = 0 hoặc cột chưa có (DB cũ chưa qua
//    migration trong connection.ts, hoặc orders.create — thuộc mảng bán hàng —
//    chưa ghi snapshot) thì tạm lấy products.cost hiện tại để báo cáo không
//    chết; khi snapshot đã được ghi đầy đủ thì luôn dùng snapshot.
//  * Giảm giá cấp đơn (orders.discount_amount) không phân bổ được về từng dòng
//    sản phẩm, nên tổng net_revenue theo sản phẩm có thể lớn hơn doanh thu
//    thật khi đơn có giảm giá cấp đơn.
//  * Mọi số tiền là INTEGER cents; ngày đếm theo giờ máy quầy (localtime).
//  * Types của các row trả về định nghĩa CỤC BỘ ở đây (src/shared/types.ts
//    chưa có — phase tích hợp sẽ bổ sung nếu cần expose qua preload).
// ============================================================================

import { prepare } from '../connection.js'

// ----------------------------------------------------------------------------
// Types cục bộ
// ----------------------------------------------------------------------------

/** Khoảng thời gian + bộ lọc dùng chung. from/to là unix seconds (bao gồm cả 2 đầu). */
export interface ReportRange {
  from?: number
  to?: number
  /** Lọc theo ca (orders.shift_id). */
  shiftId?: number
  /** Lọc theo nhân viên tạo đơn (orders.user_id). */
  userId?: number
}

export interface SalesSummary {
  order_count: number
  revenue: number          // SUM(orders.total) — sau giảm giá, gồm thuế (cents)
  collected: number        // SUM(paid_amount) — đã thu thực tế (cents)
  outstanding: number      // revenue - collected — còn nợ (cents)
  tax_total: number        // SUM(tax_total) — thuế thu hộ (cents)
  discount_total: number   // SUM(discount_amount) — CHỈ giảm giá cấp đơn (cents)
  cogs: number             // giá vốn theo snapshot cost_cents (cents)
  gross_profit: number     // revenue - tax_total - cogs (cents)
  avg_order_value: number  // revenue / order_count (cents)
}

export interface DailyRevenueRow {
  day: string              // 'YYYY-MM-DD' (giờ máy quầy)
  order_count: number
  revenue: number
  tax_total: number
  cogs: number
  gross_profit: number
}

export interface ShiftRevenueRow {
  shift_id: number | null  // NULL = đơn không gắn ca
  user_id: number | null   // thu ngân của ca
  user_name: string | null
  opened_at: number | null
  closed_at: number | null
  shift_status: number | null  // ShiftStatus của ca; NULL nếu đơn không gắn ca
  order_count: number
  revenue: number
  tax_total: number
  cogs: number
  gross_profit: number
}

export interface UserRevenueRow {
  user_id: number
  username: string
  user_name: string        // display_name
  order_count: number
  revenue: number
  discount_total: number   // giảm giá cấp đơn (cents)
  tax_total: number
  cogs: number
  gross_profit: number
}

export interface ProductReportOptions extends ReportRange {
  /** Sắp xếp: 'revenue' (mặc định) theo doanh thu sau giảm giá, 'qty' theo số lượng. */
  orderBy?: 'revenue' | 'qty'
  limit?: number
}

export interface ProductRevenueRow {
  product_id: number
  product_name: string
  barcode: string | null
  unit: string | null
  category_id: number | null
  category_name: string | null
  qty_sold: number
  gross_sales: number      // SUM(unit_price * qty) trước giảm giá dòng (cents)
  discount_total: number   // giảm giá THEO DÒNG (order_details.discount_amount, cents)
  net_revenue: number      // gross_sales - discount_total, chưa trừ thuế/cập đơn (cents)
  cogs: number             // SUM(cost_snapshot * qty) (cents)
  gross_profit: number     // net_revenue - cogs (cents)
}

export interface CategoryRevenueRow {
  category_id: number | null
  category_name: string    // 'Chưa phân loại' khi sản phẩm không có nhóm
  qty_sold: number
  net_revenue: number
  cogs: number
  gross_profit: number
}

export interface PaymentMethodRevenueRow {
  payment_method_id: number
  code: string             // 'CASH' | 'CARD' | 'QR' | ...
  name: string
  payment_count: number    // số DÒNG thanh toán (split-tender: 1 đơn có thể nhiều dòng)
  total: number            // cents
}

export interface StockReportOptions {
  /** Chỉ trả hàng hết tồn hoặc dưới định mức (khớp quy ước UI Products.tsx:
   *  hết hàng = stock <= 0; tồn thấp = low_stock_alert > 0 và stock <= low_stock_alert). */
  lowOnly?: boolean
  includeInactive?: boolean  // mặc định chỉ sản phẩm is_active = 1
}

export interface StockRow {
  product_id: number
  barcode: string | null
  name: string
  unit: string | null
  category_id: number | null
  category_name: string | null
  stock: number            // cột dẫn xuất (trigger tự sync từ stock_movements)
  price: number            // cents
  cost: number             // cents
  low_stock_alert: number
  is_active: number
  stock_value: number      // stock * cost (cents)
  sold_qty_30d: number     // số lượng bán 30 ngày qua (stock_movements type=0)
}

export interface StockReportSummary {
  product_count: number
  total_stock_value: number    // SUM(stock * cost) (cents)
  out_of_stock_count: number   // stock <= 0
  low_stock_count: number      // 0 < stock <= low_stock_alert (low_stock_alert > 0)
}

export interface StockReportResult {
  items: StockRow[]
  summary: StockReportSummary
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Bộ trạng thái đơn tính doanh thu: 1 = đã thanh toán, 4 = một phần. */
const REVENUE_STATUSES = 'o.status IN (1, 4)'

const columnCache = new Map<string, boolean>()

/**
 * True nếu bảng có cột — dùng để chọn biểu thức giá vốn. Cần thiết vì DB cũ
 * chỉ có cột order_details.cost_cents sau khi migration trong connection.ts
 * chạy (phase khác sở hữu); schema.sql cho cài mới luôn có cột này.
 */
function hasColumn(table: string, column: string): boolean {
  const key = `${table}.${column}`
  const cached = columnCache.get(key)
  if (cached !== undefined) return cached
  const row = prepare(
    `SELECT COUNT(*) AS c FROM pragma_table_info(?) WHERE name = ?`
  ).get(table, column) as { c: number }
  const ok = row.c > 0
  columnCache.set(key, ok)
  return ok
}

/**
 * Biểu thức GIÁ VỎ ĐƠN VỊ cho một dòng bán. Ưu tiên snapshot
 * `order_details.cost_cents` (P1.1). Khi snapshot = 0 (dòng bán cũ trước khi
 * orders.create ghi snapshot, hoặc DB chưa migrate — cột không tồn tại) thì
 * tạm lấy products.cost HIỆN TẠI: chưa chính xác 100% theo thời điểm nhưng
 * luôn tốt hơn coi giá vốn = 0. Khi orders.create đã snapshot đầy đủ thì
 * mọi dòng đều dùng snapshot.
 */
function unitCostExpr(detailAlias: string, productAlias: string): string {
  return hasColumn('order_details', 'cost_cents')
    ? `COALESCE(NULLIF(${detailAlias}.cost_cents, 0), ${productAlias}.cost)`
    : `${productAlias}.cost`
}

/**
 * Subquery SỐ LƯỢNG ĐÃ TRẢ theo order_detail_id (tổng từ return_details —
 * snapshot số lượng của các phiếu trả một phần). LEFT JOIN vào các báo cáo cấp
 * DÒNG (sản phẩm / nhóm hàng) để tính theo phần chưa trả.
 */
function returnedByDetailSubquery(): string {
  return `
    SELECT rd.order_detail_id AS detail_id, SUM(rd.quantity) AS ret_qty
      FROM return_details rd
     GROUP BY rd.order_detail_id
  `
}

/**
 * Subquery tổng giá vốn NET + thuế CỦA HÀNG ĐÃ TRẢ theo order_id, LEFT JOIN
 * vào các báo cáo cấp đơn (ngày / ca / nhân viên / tổng hợp). Luôn JOIN
 * products để có fallback.
 *
 * Trả một phần: giá vốn chỉ tính phần CHƯA trả (cost × (qty − ret_qty)); thuế
 * của phần đã trả = tax_amount × ret_qty/quantity (thành phần thuế của
 * refund_amount trong returns.ts tỷ lệ đúng vậy — order-discount không làm
 * đổi phần thuế vì thuế snapshot trên giá trị sau giảm giá dòng).
 */
function orderFactsSubquery(): string {
  const unitCost = unitCostExpr('d', 'dp')
  return `
    SELECT d.order_id AS order_id,
           COALESCE(SUM(${unitCost} * (d.quantity - COALESCE(rq.ret_qty, 0))), 0) AS cogs,
           COALESCE(SUM(ROUND(d.tax_amount * 1.0 * COALESCE(rq.ret_qty, 0) / d.quantity)), 0) AS tax_returned
      FROM order_details d
      JOIN products dp ON dp.id = d.product_id
      LEFT JOIN (${returnedByDetailSubquery()}) rq ON rq.detail_id = d.id
     GROUP BY d.order_id
  `
}

/**
 * Subquery tổng tiền ĐÃ HOÀN theo order_id (returns.total — snapshot refund
 * đã trừ phần khuyến mại phân bổ) để trừ NET khỏi doanh thu các đơn còn
 * status 1/4 sau khi trả một phần. Đơn trả ĐỦ (status 3) tự rớt khỏi bộ lọc
 * nên không cần nhìn subquery này.
 */
function refundsByOrderSubquery(): string {
  return `
    SELECT r.order_id AS order_id, SUM(r.total) AS refunded
      FROM returns r
     GROUP BY r.order_id
  `
}

/** Điều kiện khoảng thời gian / ca / nhân viên trên alias `o` (orders). */
function rangeConds(range: ReportRange): { conds: string[]; params: unknown[] } {
  const conds: string[] = []
  const params: unknown[] = []
  if (range.from != null) { conds.push('o.created_at >= ?'); params.push(range.from) }
  if (range.to != null) { conds.push('o.created_at <= ?'); params.push(range.to) }
  if (range.shiftId != null) { conds.push('o.shift_id = ?'); params.push(range.shiftId) }
  if (range.userId != null) { conds.push('o.user_id = ?'); params.push(range.userId) }
  return { conds, params }
}

function whereExtra(conds: string[]): string {
  return conds.length ? ` AND ${conds.join(' AND ')}` : ''
}

// ----------------------------------------------------------------------------
// Tổng hợp chung
// ----------------------------------------------------------------------------

/**
 * Tổng hợp doanh thu / đã thu / giá vốn / lợi nhuận gộp cho một khoảng thời
 * gian (hoặc 1 ca / 1 nhân viên). Là nguồn cho các thẻ header của màn Báo cáo.
 * Doanh thu/thuế/giá vốn đều NET phần trả hàng một phần (theo đơn).
 */
export function getSalesSummary(range: ReportRange = {}): SalesSummary {
  const { conds, params } = rangeConds(range)
  const row = prepare(`
    SELECT
      COUNT(*)                             AS order_count,
      COALESCE(SUM(o.total - COALESCE(rr.refunded, 0)), 0)            AS revenue,
      COALESCE(SUM(o.paid_amount), 0)      AS collected,
      COALESCE(SUM(o.tax_total - COALESCE(c.tax_returned, 0)), 0)     AS tax_total,
      COALESCE(SUM(o.discount_amount), 0)  AS discount_total,
      COALESCE(SUM(COALESCE(c.cogs, 0)), 0) AS cogs
    FROM orders o
    LEFT JOIN (${orderFactsSubquery()}) c ON c.order_id = o.id
    LEFT JOIN (${refundsByOrderSubquery()}) rr ON rr.order_id = o.id
    WHERE ${REVENUE_STATUSES}${whereExtra(conds)}
  `).get(...params) as {
    order_count: number
    revenue: number
    collected: number
    tax_total: number
    discount_total: number
    cogs: number
  }

  return {
    order_count: row.order_count,
    revenue: row.revenue,
    collected: row.collected,
    outstanding: row.revenue - row.collected,
    tax_total: row.tax_total,
    discount_total: row.discount_total,
    cogs: row.cogs,
    gross_profit: row.revenue - row.tax_total - row.cogs,
    avg_order_value: row.order_count > 0 ? Math.round(row.revenue / row.order_count) : 0
  }
}

// ----------------------------------------------------------------------------
// Doanh thu theo chiều thời gian / ca / nhân viên
// ----------------------------------------------------------------------------

/** Doanh thu + lợi nhuận gộp theo NGÀY (giờ máy quầy), mới nhất trước. NET phần trả một phần. */
export function revenueByDay(range: ReportRange = {}): DailyRevenueRow[] {
  const { conds, params } = rangeConds(range)
  return prepare(`
    SELECT
      date(o.created_at, 'unixepoch', 'localtime') AS day,
      COUNT(*)                                      AS order_count,
      COALESCE(SUM(o.total - COALESCE(rr.refunded, 0)), 0)      AS revenue,
      COALESCE(SUM(o.tax_total - COALESCE(c.tax_returned, 0)), 0) AS tax_total,
      COALESCE(SUM(COALESCE(c.cogs, 0)), 0)         AS cogs,
      COALESCE(SUM(o.total - COALESCE(rr.refunded, 0)), 0)
        - COALESCE(SUM(o.tax_total - COALESCE(c.tax_returned, 0)), 0)
        - COALESCE(SUM(COALESCE(c.cogs, 0)), 0)     AS gross_profit
    FROM orders o
    LEFT JOIN (${orderFactsSubquery()}) c ON c.order_id = o.id
    LEFT JOIN (${refundsByOrderSubquery()}) rr ON rr.order_id = o.id
    WHERE ${REVENUE_STATUSES}${whereExtra(conds)}
    GROUP BY day
    ORDER BY day DESC
  `).all(...params) as DailyRevenueRow[]
}

/**
 * Doanh thu + lợi nhuận gộp theo CA (orders.shift_id), kèm thông tin ca và thu
 * ngân. Số tiền mặt trong ca (opening/expected/counted) xem qua shifts repo —
 * báo cáo này chỉ về doanh số. Đơn không gắn ca gom về shift_id = NULL.
 */
export function revenueByShift(range: ReportRange = {}): ShiftRevenueRow[] {
  const { conds, params } = rangeConds(range)
  return prepare(`
    SELECT
      o.shift_id                                    AS shift_id,
      s.user_id                                     AS user_id,
      u.display_name                                AS user_name,
      s.opened_at                                   AS opened_at,
      s.closed_at                                   AS closed_at,
      s.status                                      AS shift_status,
      COUNT(*)                                      AS order_count,
      COALESCE(SUM(o.total - COALESCE(rr.refunded, 0)), 0)      AS revenue,
      COALESCE(SUM(o.tax_total - COALESCE(c.tax_returned, 0)), 0) AS tax_total,
      COALESCE(SUM(COALESCE(c.cogs, 0)), 0)         AS cogs,
      COALESCE(SUM(o.total - COALESCE(rr.refunded, 0)), 0)
        - COALESCE(SUM(o.tax_total - COALESCE(c.tax_returned, 0)), 0)
        - COALESCE(SUM(COALESCE(c.cogs, 0)), 0)     AS gross_profit
    FROM orders o
    LEFT JOIN shifts s ON s.id = o.shift_id
    LEFT JOIN users u  ON u.id = s.user_id
    LEFT JOIN (${orderFactsSubquery()}) c ON c.order_id = o.id
    LEFT JOIN (${refundsByOrderSubquery()}) rr ON rr.order_id = o.id
    WHERE ${REVENUE_STATUSES}${whereExtra(conds)}
    GROUP BY o.shift_id
    ORDER BY MAX(o.created_at) DESC
  `).all(...params) as ShiftRevenueRow[]
}

/**
 * Báo cáo hiệu quả nhân viên (P0.6): số đơn, doanh thu, giảm giá cấp đơn,
 * giá vốn và lợi nhuận gộp theo người tạo đơn (orders.user_id — có index
 * idx_orders_user).
 */
export function revenueByUser(range: ReportRange = {}): UserRevenueRow[] {
  const { conds, params } = rangeConds(range)
  return prepare(`
    SELECT
      o.user_id                                     AS user_id,
      u.username                                    AS username,
      u.display_name                                AS user_name,
      COUNT(*)                                      AS order_count,
      COALESCE(SUM(o.total - COALESCE(rr.refunded, 0)), 0)      AS revenue,
      COALESCE(SUM(o.discount_amount), 0)           AS discount_total,
      COALESCE(SUM(o.tax_total - COALESCE(c.tax_returned, 0)), 0) AS tax_total,
      COALESCE(SUM(COALESCE(c.cogs, 0)), 0)         AS cogs,
      COALESCE(SUM(o.total - COALESCE(rr.refunded, 0)), 0)
        - COALESCE(SUM(o.tax_total - COALESCE(c.tax_returned, 0)), 0)
        - COALESCE(SUM(COALESCE(c.cogs, 0)), 0)     AS gross_profit
    FROM orders o
    JOIN users u ON u.id = o.user_id
    LEFT JOIN (${orderFactsSubquery()}) c ON c.order_id = o.id
    LEFT JOIN (${refundsByOrderSubquery()}) rr ON rr.order_id = o.id
    WHERE ${REVENUE_STATUSES}${whereExtra(conds)}
    GROUP BY o.user_id
    ORDER BY revenue DESC
  `).all(...params) as UserRevenueRow[]
}

// ----------------------------------------------------------------------------
// Doanh thu theo sản phẩm / danh mục / phương thức
// ----------------------------------------------------------------------------

/**
 * Doanh thu + lợi nhuận theo SẢN PHẨM, gộp từ order_details (snapshot
 * giá/thuế/giá vốn). Dùng làm "doanh thu theo sản phẩm" và (qua topProducts)
 * "top sản phẩm bán chạy". Mọi số liệu tính theo phần CHƯA TRẢ của từng dòng
 * (return_details) — trả một phần không còn làm qty/doanh thu/lợi nhuận khai tăng.
 */
export function revenueByProduct(opts: ProductReportOptions = {}): ProductRevenueRow[] {
  const { orderBy = 'revenue', limit } = opts
  const { conds, params } = rangeConds(opts)
  // orderBy đến từ whitelist của interface nên nội suy an toàn.
  const orderExpr = orderBy === 'qty' ? 'qty_sold' : 'net_revenue'
  const useLimit = limit != null && limit > 0
  if (useLimit) params.push(limit)

  // Số lượng chưa trả của từng dòng bán (return_details snapshot số lượng trả).
  const netQty = '(od.quantity - COALESCE(rq.ret_qty, 0))'
  // Giảm giá dòng của phần chưa trả, tỷ lệ với số lượng (không trả dòng nào ->
  // netQty = quantity -> giữ nguyên giá trị, không drift).
  const discNet = `ROUND(od.discount_amount * 1.0 * ${netQty} / od.quantity)`

  const rows = prepare(`
    SELECT
      od.product_id                                            AS product_id,
      p.name                                                   AS product_name,
      p.barcode                                                AS barcode,
      p.unit                                                   AS unit,
      c.id                                                     AS category_id,
      c.name                                                   AS category_name,
      SUM(${netQty})                                           AS qty_sold,
      COALESCE(SUM(od.unit_price * ${netQty}), 0)              AS gross_sales,
      COALESCE(SUM(${discNet}), 0)                             AS discount_total,
      COALESCE(SUM(od.unit_price * ${netQty}) - SUM(${discNet}), 0) AS net_revenue,
      COALESCE(SUM(${unitCostExpr('od', 'p')} * ${netQty}), 0) AS cogs,
      COALESCE(SUM(od.unit_price * ${netQty}) - SUM(${discNet}), 0)
        - COALESCE(SUM(${unitCostExpr('od', 'p')} * ${netQty}), 0) AS gross_profit
    FROM order_details od
    JOIN orders o   ON o.id = od.order_id AND ${REVENUE_STATUSES}
    JOIN products p ON p.id = od.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN (${returnedByDetailSubquery()}) rq ON rq.detail_id = od.id
    ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
    GROUP BY od.product_id
    ORDER BY ${orderExpr} DESC
    ${useLimit ? 'LIMIT ?' : ''}
  `).all(...params) as ProductRevenueRow[]
  return rows
}

/**
 * Top sản phẩm bán chạy: như revenueByProduct nhưng mặc định xếp theo SỐ
 * LƯỢNG bán và giới hạn 10 dòng (truyền limit/orderBy để đổi).
 */
export function topProducts(opts: ProductReportOptions = {}): ProductRevenueRow[] {
  return revenueByProduct({
    ...opts,
    orderBy: opts.orderBy ?? 'qty',
    limit: opts.limit ?? 10
  })
}

/** Doanh thu + lợi nhuận theo NHÓM HÀNG (categories, phân cấp phẳng). NET phần trả một phần. */
export function revenueByCategory(range: ReportRange = {}): CategoryRevenueRow[] {
  const { conds, params } = rangeConds(range)
  const netQty = '(od.quantity - COALESCE(rq.ret_qty, 0))'
  const discNet = `ROUND(od.discount_amount * 1.0 * ${netQty} / od.quantity)`
  return prepare(`
    SELECT
      c.id                                                     AS category_id,
      COALESCE(c.name, 'Chưa phân loại')                       AS category_name,
      SUM(${netQty})                                           AS qty_sold,
      COALESCE(SUM(od.unit_price * ${netQty}) - SUM(${discNet}), 0) AS net_revenue,
      COALESCE(SUM(${unitCostExpr('od', 'p')} * ${netQty}), 0) AS cogs,
      COALESCE(SUM(od.unit_price * ${netQty}) - SUM(${discNet}), 0)
        - COALESCE(SUM(${unitCostExpr('od', 'p')} * ${netQty}), 0) AS gross_profit
    FROM order_details od
    JOIN orders o   ON o.id = od.order_id AND ${REVENUE_STATUSES}
    JOIN products p ON p.id = od.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN (${returnedByDetailSubquery()}) rq ON rq.detail_id = od.id
    ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
    GROUP BY c.id, c.name
    ORDER BY net_revenue DESC
  `).all(...params) as CategoryRevenueRow[]
}

/**
 * Doanh thu theo PHƯƠNG THỨC thanh toán (P1.9 — tab "theo phương thức"):
 * JOIN order_payments (split-tender nên 1 đơn có thể góp nhiều dòng).
 */
export function revenueByPaymentMethod(range: ReportRange = {}): PaymentMethodRevenueRow[] {
  const { conds, params } = rangeConds(range)
  return prepare(`
    SELECT
      pm.id                              AS payment_method_id,
      pm.code                            AS code,
      pm.name                            AS name,
      COUNT(*)                           AS payment_count,
      COALESCE(SUM(op.amount), 0)        AS total
    FROM order_payments op
    JOIN orders o ON o.id = op.order_id AND ${REVENUE_STATUSES}
    JOIN payment_methods pm ON pm.id = op.payment_method_id
    ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
    GROUP BY pm.id
    ORDER BY total DESC
  `).all(...params) as PaymentMethodRevenueRow[]
}

// ----------------------------------------------------------------------------
// Tồn kho (P1.9)
// ----------------------------------------------------------------------------

/**
 * Báo cáo tồn kho hiện tại: tồn (cột dẫn xuất — KHÔNG bao giờ UPDATE trực
 * tiếp), giá trị kho = stock × cost, ngưỡng tồn thấp theo cột
 * low_stock_alert, và số lượng bán 30 ngày qua (stock_movements type=0) làm
 * tốc độ bán tham khảo. Sắp xếp tồn tăng dần — hàng hết/thiếu lên đầu.
 */
export function stockReport(opts: StockReportOptions = {}): StockReportResult {
  const conds: string[] = []
  const params: unknown[] = []
  if (!opts.includeInactive) conds.push('p.is_active = 1')
  if (opts.lowOnly) {
    // Cùng quy ước với badge UI Products.tsx: hết hàng (stock <= 0) hoặc
    // tồn thấp (low_stock_alert > 0 && stock <= low_stock_alert).
    conds.push('(p.stock <= 0 OR (p.low_stock_alert > 0 AND p.stock <= p.low_stock_alert))')
  }
  const clause = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

  const items = prepare(`
    SELECT
      p.id                        AS product_id,
      p.barcode                   AS barcode,
      p.name                      AS name,
      p.unit                      AS unit,
      c.id                        AS category_id,
      c.name                      AS category_name,
      p.stock                     AS stock,
      p.price                     AS price,
      p.cost                      AS cost,
      p.low_stock_alert           AS low_stock_alert,
      p.is_active                 AS is_active,
      p.stock * p.cost            AS stock_value,
      COALESCE(s.sold_qty_30d, 0) AS sold_qty_30d
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN (
      SELECT sm.product_id, -SUM(sm.delta) AS sold_qty_30d
        FROM stock_movements sm
       WHERE sm.type = 0 AND sm.created_at >= unixepoch() - ${30 * 86400}
       GROUP BY sm.product_id
    ) s ON s.product_id = p.id
    ${clause}
    ORDER BY p.stock ASC, p.name
  `).all(...params) as StockRow[]

  const summary = prepare(`
    SELECT
      COUNT(*)                                                                    AS product_count,
      COALESCE(SUM(p.stock * p.cost), 0)                                          AS total_stock_value,
      COALESCE(SUM(CASE WHEN p.stock <= 0 THEN 1 ELSE 0 END), 0)                  AS out_of_stock_count,
      COALESCE(SUM(CASE WHEN p.stock > 0 AND p.low_stock_alert > 0
                             AND p.stock <= p.low_stock_alert THEN 1 ELSE 0 END), 0) AS low_stock_count
    FROM products p
    ${clause}
  `).get(...params) as StockReportSummary

  return { items, summary }
}
