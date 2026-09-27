// ============================================================================
//  Postie POS - Shared domain types
// ----------------------------------------------------------------------------
//  These types describe the shape of rows returned by the repositories and
//  are imported by both the main process (repositories) and the renderer
//  (via the preload API). Keep them free of Node/Electron-specific imports.
// ============================================================================

export type Role = 0 | 1 | 2          // 0=admin, 1=manager, 2=cashier
export type OrderStatus = 0 | 1 | 2 | 3 | 4 // pending, paid, voided, refunded, partial
export type ShiftStatus = 0 | 1 | 2   // open, closed, reconciled
export type StockMovementType = 0 | 1 | 2 | 3 | 4 // sale, return, purchase, adjust, wastage

export interface User {
  id: number
  username: string
  display_name: string
  role: Role
  is_active: number
  created_at: number
}

export interface Category {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
  is_active: number
}

export interface Tax {
  id: number
  name: string
  rate: number           // per-mille (1000 = 10%)
  is_active: number
}

export interface Customer {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  /** MST — có từ migration thêm cột (connection.ts); undefined trên DB chưa migrate. */
  tax_code?: string | null
  balance: number        // cents owed (positive = owes store) — DERIVED
  points: number         // loyalty (future)
  is_active: number
  created_at: number
  updated_at: number
}

export type CustomerLedgerType = 0 | 1 | 2 // 0=sale_credit, 1=payment, 2=adjustment

export interface CustomerLedgerEntry {
  id: number
  customer_id: number
  type: CustomerLedgerType
  amount: number          // signed cents: + = more debt, - = less debt
  order_id: number | null
  note: string | null
  created_at: number
  created_by: number | null
  /** Joined from orders when the entry is tied to an invoice. */
  invoice_no?: number | null
}

/** Aggregate counters for the Customers/Debt screen header cards. */
export interface CustomerSummary {
  active_customers: number   // is_active = 1
  debtor_count: number       // active customers with balance > 0
  total_outstanding: number  // sum of balances > 0 (cents)
}

/** Partial update for an existing customer (repo rejects an empty name). */
export interface UpdateCustomerInput {
  name?: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

/** Loại hàng hóa: 0 = hàng thường, 1 = combo/đóng gói (thành phần ở ComboDetail). */
export type ProductType = 0 | 1

export interface Product {
  id: number
  barcode: string | null
  name: string
  /** Loại hàng — có từ migration thêm cột (connection.ts); mặc định 0 khi undefined. */
  type?: ProductType
  category_id: number | null
  supplier_id: number | null
  price: number          // cents
  cost: number           // cents
  tax_id: number | null
  unit: string | null
  stock: number
  low_stock_alert: number
  is_active: number
  created_at: number
  updated_at: number
}

export interface ListProductsOptions {
  search?: string
  categoryId?: number
  activeOnly?: boolean
  page?: number
  pageSize?: number
}

export interface ProductListResult {
  items: Product[]
  total: number
  page: number
  pageSize: number
}

export interface CreateProductInput {
  barcode: string | null
  name: string
  type?: ProductType
  category_id?: number | null
  supplier_id?: number | null
  price: number
  cost?: number
  tax_id?: number | null
  unit?: string | null
  stock?: number
  low_stock_alert?: number
  /** Người tạo — ghi vào dòng "Tồn đầu" trên thẻ kho (stock_movements.created_by
   *  là NOT NULL). Bắt buộc khi stock > 0. */
  created_by?: number
}

/** Partial update for an existing product. `stock` is intentionally absent —
 *  it is a derived column; use a stock movement (adjustStock) to change it. */
export interface UpdateProductInput {
  barcode?: string | null
  name?: string
  type?: ProductType
  category_id?: number | null
  supplier_id?: number | null
  price?: number
  cost?: number
  tax_id?: number | null
  unit?: string | null
  low_stock_alert?: number
  is_active?: number
}

export interface ImportRowPreview {
  /** 1-based row number in the sheet, counting the header as row 1. */
  row: number
  name: string
  barcode: string | null
  stock: number
  cost: number          // cents
  price: number         // cents
  unit: string | null
  status: 'new' | 'update' | 'error'
  error?: string
}

export interface ImportPickResult {
  fileName: string
  rows: ImportRowPreview[]
  /** Columns that could not be matched to a known header alias. */
  unmappedHeaders: string[]
}

export interface ImportCommitResult {
  imported: number
  updated: number
  failed: Array<{ row: number; name: string; reason: string }>
}

export interface OrderItemInput {
  product_id: number
  quantity: number
  unit_price: number     // cents (usually copied from product.price)
  tax_rate: number       // per-mille snapshot
  discount_amount?: number // cents per line
  note?: string
}

export interface OrderPaymentInput {
  payment_method_id: number
  amount: number         // cents
  reference?: string
}

export interface CreateOrderInput {
  user_id: number
  customer_id?: number | null
  shift_id?: number | null
  items: OrderItemInput[]
  payments: OrderPaymentInput[]
  discount_amount?: number   // order-level discount (cents)
  discount_reason?: string
  note?: string
}

export interface OrderDetailRow {
  id: number
  order_id: number
  product_id: number
  /** Phiên bản được bán (P2 variants) — có từ migration thêm cột; NULL = bán sản phẩm gốc. */
  variant_id?: number | null
  unit_price: number
  /** SNAPSHOT giá vốn tại thời điểm bán (cents, P1) — có từ migration thêm cột; undefined = DB chưa migrate. */
  cost_cents?: number
  quantity: number
  tax_rate: number
  tax_amount: number
  discount_amount: number
  subtotal: number
  note: string | null
}

export interface OrderPaymentRow {
  id: number
  order_id: number
  payment_method_id: number
  amount: number
  reference: string | null
  created_at: number
}

export interface Order {
  id: number
  invoice_no: number
  user_id: number
  customer_id: number | null
  shift_id: number | null
  subtotal_before_tax: number
  tax_total: number
  discount_amount: number
  total: number
  paid_amount: number
  status: OrderStatus
  /** NOT NULL = đơn treo (giá trị = thời điểm giữ đơn). Có từ migration thêm cột.
   *  Lưu ý: status=0 vẫn mang nghĩa "chưa trả đủ/bán chịu" — phân biệt bằng held_at. */
  held_at?: number | null
  discount_reason: string | null
  note: string | null
  /** Số hóa đơn điện tử (P2 giai đoạn 2 — stub). Có từ migration thêm cột. */
  e_invoice_no?: string | null
  created_at: number
  details?: OrderDetailRow[]
  payments?: OrderPaymentRow[]
  customer_name?: string | null
  item_count?: number
}

export interface ListOrdersOptions {
  search?: string
  status?: OrderStatus | 'all'
  from?: number
  to?: number
  page?: number
  pageSize?: number
}

export interface OrderListResult {
  items: Order[]
  total: number
  page: number
  pageSize: number
}

export interface Shift {
  id: number
  user_id: number
  opened_at: number
  closed_at: number | null
  opening_cash: number
  expected_cash: number | null
  counted_cash: number | null
  difference: number | null
  status: ShiftStatus
  note: string | null
}

export interface PaymentMethod {
  id: number
  name: string
  code: string          // stable uppercase token: 'CASH', 'CARD', 'QR'
  is_active: number
}

// ============================================================================
//  Bổ sung schema theo lộ trình P0/P1/P2 (docs/kiotviet-roadmap.md §5–§6)
// ----------------------------------------------------------------------------
//  Quy ước tính tùy chọn: các field đánh dấu `?` kèm ghi chú "migration" là
//  CỘT MỚI TRÊN BẢNG CŨ — có sẵn khi cài mới (db/schema.sql) và chỉ xuất hiện
//  trên DB cũ sau khi migration tương ứng trong electron/db/connection.ts được
//  áp dụng. Trước khi migrate, giá trị runtime có thể là undefined.
//  Tất cả số tiền đều là INTEGER cents; balance/stock là cột dẫn xuất có
//  trigger tự sync — không bao giờ UPDATE trực tiếp.
// ============================================================================

// ----------------------------------------------------------------------------
// P0.4 — Kết ca đầy đủ: thu/chi tiền mặt trong ca (shift_cash_events)
// expected_cash = opening_cash + cash_sales + SUM(thu) - SUM(chi)
// ----------------------------------------------------------------------------

export type ShiftCashEventType = 0 | 1 // 0=thu (cash in), 1=chi (cash out)

export interface ShiftCashEvent {
  id: number
  shift_id: number
  type: ShiftCashEventType
  amount: number          // cents (> 0)
  note: string | null
  created_at: number
  created_by: number | null
}

export interface CreateShiftCashEventInput {
  shift_id: number
  type: ShiftCashEventType
  amount: number          // cents, phải > 0
  note?: string
  created_by?: number | null
}

// ----------------------------------------------------------------------------
// P1.2 — Nhà cung cấp + công nợ phải trả (suppliers.balance, supplier_ledger)
// ----------------------------------------------------------------------------

export interface Supplier {
  id: number
  name: string
  phone: string | null
  email: string | null
  address: string | null
  /** Số tiền cửa hàng NỢ NCC (cents) — DERIVED từ supplier_ledger qua trigger.
   *  Có từ migration thêm cột (cùng updated_at); undefined trên DB chưa migrate. */
  balance?: number
  is_active: number
  created_at: number
  updated_at?: number
}

export interface CreateSupplierInput {
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
}

/** Partial update cho NCC (repo từ chối name rỗng) — mirror UpdateCustomerInput. */
export interface UpdateSupplierInput {
  name?: string
  phone?: string | null
  email?: string | null
  address?: string | null
  is_active?: number
}

export type SupplierLedgerType = 0 | 1 | 2 // 0=nợ nhập, 1=trả NCC, 2=điều chỉnh

export interface SupplierLedgerEntry {
  id: number
  supplier_id: number
  type: SupplierLedgerType
  amount: number          // signed cents: + = nợ tăng, - = nợ giảm
  po_id: number | null
  note: string | null
  created_at: number
  created_by: number
  /** Joined từ purchase_orders khi entry gắn phiếu nhập. */
  po_status?: PurchaseOrderStatus
}

/** Ghi công nợ NCC: type=0 nợ nhập (+), type=1 trả NCC (−), type=2 điều chỉnh (signed). */
export interface CreateSupplierLedgerInput {
  supplier_id: number
  type: SupplierLedgerType
  amount: number          // signed cents
  po_id?: number | null
  note?: string
  created_by?: number
}

/** Tổng hợp công nợ cho header màn Nhà cung cấp (mirror CustomerSummary). */
export interface SupplierSummary {
  active_suppliers: number   // is_active = 1
  debtor_count: number       // NCC đang bị owe (balance > 0)
  total_payable: number      // tổng balance > 0 (cents)
}

// ----------------------------------------------------------------------------
// P1.2 + P2.3 — Phiếu nhập hàng / đặt hàng nhập (purchase_orders)
// ----------------------------------------------------------------------------

export type PurchaseOrderStatus = 0 | 1 | 2 // 0=chờ giao, 1=đã nhập, 2=đã hủy

export interface PurchaseOrderDetailRow {
  id: number
  po_id: number
  product_id: number
  qty: number
  cost: number            // cents (đơn giá NCC; trở thành products.cost khi nhập)
  /** Joined cho UI. */
  product_name?: string
  barcode?: string | null
  unit?: string | null
}

export interface PurchaseOrder {
  id: number
  supplier_id: number
  status: PurchaseOrderStatus
  total: number           // cents
  paid: number            // cents đã trả NCC; total - paid = còn nợ (qua supplier_ledger)
  note: string | null
  created_at: number
  created_by: number
  details?: PurchaseOrderDetailRow[]
  /** Joined cho list UI. */
  supplier_name?: string
}

export interface PurchaseOrderDetailInput {
  product_id: number
  qty: number             // > 0
  cost: number            // cents >= 0
}

export interface CreatePurchaseOrderInput {
  supplier_id: number
  details: PurchaseOrderDetailInput[]
  /** Số tiền trả NCC ngay khi tạo/nhập; phần còn lại ghi supplier_ledger type=0. Mặc định 0. */
  paid?: number
  note?: string
  created_by?: number
}

// ----------------------------------------------------------------------------
// P1.3 — Kiểm kho (stocktakes / stocktake_details)
// ----------------------------------------------------------------------------

export type StocktakeStatus = 0 | 1 | 2 // 0=đang kiểm, 1=hoàn thành, 2=đã hủy

export interface StocktakeDetailRow {
  id: number
  stocktake_id: number
  product_id: number
  book_qty: number        // tồn số sách chốt khi thêm dòng
  counted_qty: number     // số đếm thực tế
  /** = counted_qty - book_qty (tính sẵn cho UI; không lưu trong DB). */
  diff_qty?: number
  /** Joined cho UI. */
  product_name?: string
  barcode?: string | null
}

export interface Stocktake {
  id: number
  status: StocktakeStatus
  note: string | null
  created_at: number
  created_by: number
  details?: StocktakeDetailRow[]
}

export interface StocktakeDetailInput {
  product_id: number
  /** Bỏ qua để repo tự chốt products.stock tại thời điểm thêm dòng. */
  book_qty?: number
  counted_qty: number
}

export interface CreateStocktakeInput {
  note?: string
  details?: StocktakeDetailInput[]
}

/** "Hoàn thành" phiếu: sinh stock_movements type=3, delta = counted - book (cho phép âm) trong 1 transaction. */
export interface CompleteStocktakeInput {
  stocktake_id: number
  /** Ghi đè số đếm cuối cho từng dòng trước khi hoàn thành (tùy chọn). */
  overrides?: Array<{ product_id: number; counted_qty: number }>
  created_by?: number
}

// ----------------------------------------------------------------------------
// P1.5 — Đơn treo: dùng orders.held_at (xem Order) — không có bảng mới.
// ----------------------------------------------------------------------------

/** Bản ghi đơn treo cho màn "Hóa đơn treo" (list orders WHERE held_at IS NOT NULL). */
export interface HeldBill {
  id: number
  invoice_no: number
  held_at: number
  total: number
  customer_id: number | null
  /** Joined cho UI. */
  customer_name?: string | null
  item_count?: number
  user_id: number
}

// ----------------------------------------------------------------------------
// P2.1 — Khuyến mại (promotions + vouchers)
// ----------------------------------------------------------------------------

/**
 * 0 = giảm % toàn đơn, 1 = giảm số tiền cố định toàn đơn,
 * 2 = giảm % theo dòng, 3 = giảm số tiền cố định theo dòng.
 */
export type PromotionType = 0 | 1 | 2 | 3

/** Phạm vi áp dụng — serialize thành JSON lưu promotions.scope_json; bỏ qua = áp dụng tất cả. */
export interface PromotionScope {
  category_ids?: number[]
  product_ids?: number[]
  customer_ids?: number[]
  min_order_cents?: number
}

export interface Promotion {
  id: number
  name: string
  type: PromotionType
  /** type 0/2: per-mille (0..10000, như taxes.rate); type 1/3: cents. */
  value: number
  scope_json: string | null
  start_at: number | null   // NULL = hiệu lực ngay
  end_at: number | null     // NULL = không hết hạn
  is_active: number
  created_at: number
  /** Parse sẵn scope_json cho UI/engine; có khi repo join/parse. */
  scope?: PromotionScope | null
}

export interface CreatePromotionInput {
  name: string
  type: PromotionType
  value: number           // per-mille (type 0/2) hoặc cents (type 1/3), phải > 0
  scope?: PromotionScope | null
  start_at?: number | null
  end_at?: number | null
}

export interface Voucher {
  id: number
  code: string
  value_cents: number     // số tiền giảm khi nhập mã (cents > 0)
  expires_at: number | null
  used_order_id: number | null
  used_at: number | null
  is_active: number
  created_at: number
}

export interface CreateVoucherInput {
  code: string
  value_cents: number
  expires_at?: number | null
}

// ----------------------------------------------------------------------------
// P2.2 — Combo/đóng gói (products.type = 1 + combo_details)
// ----------------------------------------------------------------------------

export interface ComboDetail {
  id: number
  combo_product_id: number
  component_product_id: number
  qty: number             // số thành phần trong 1 combo
  /** Joined cho UI. */
  component_name?: string
  component_cost?: number
}

export interface ComboDetailInput {
  component_product_id: number
  qty: number
}

// ----------------------------------------------------------------------------
// P2.4 — Variants & đơn vị tính quy đổi (product_variants + product_units)
// ----------------------------------------------------------------------------

export interface ProductVariant {
  id: number
  product_id: number
  attributes_json: string   // '{"color":"Đỏ","size":"M"}'
  price_cents: number
  cost_cents: number
  barcode: string | null    // UNIQUE — quét mã resolve thẳng vào variant
  stock: number             // DERIVED từ stock_movements.variant_id (trigger)
  is_active: number
  created_at: number
  updated_at: number
  /** Attributes đã parse cho UI. */
  attributes?: Record<string, string>
}

export interface CreateVariantInput {
  product_id: number
  attributes: Record<string, string>
  price_cents: number
  cost_cents?: number
  barcode?: string | null
  /** Tồn ban đầu — repo phải INSERT stock_movements (delta dương, kèm variant_id), không UPDATE. */
  stock?: number
}

export interface UpdateVariantInput {
  attributes?: Record<string, string>
  price_cents?: number
  cost_cents?: number
  barcode?: string | null
  is_active?: number
}

export interface ProductUnit {
  id: number
  product_id: number
  name: string             // 'lốc', 'thùng' (trừ đơn vị gốc trong products.unit)
  factor: number           // 1 đơn vị này = factor đơn vị gốc (1 lốc = 4 chai → 4)
}

export interface CreateProductUnitInput {
  product_id: number
  name: string
  factor: number           // > 0
}

// ----------------------------------------------------------------------------
// P2.8 — Hàng lô / hạn sử dụng FEFO (batches + stock_movements.batch_id)
// ----------------------------------------------------------------------------

export interface Batch {
  id: number
  product_id: number
  lot_no: string
  expiry_date: number | null  // unix seconds 00:00 ngày hết hạn; NULL = không theo dõi hạn
  qty: number                 // DERIVED từ stock_movements.batch_id (trigger)
  cost_cents: number
  is_active: number
  created_at: number
}

export interface CreateBatchInput {
  product_id: number
  lot_no: string
  expiry_date?: number | null
  cost_cents?: number
  /** Tồn lô ban đầu — repo phải INSERT stock_movements (delta dương, kèm batch_id), không UPDATE. */
  qty?: number
}

// ----------------------------------------------------------------------------
// P2.7 — Sổ kế toán TT152-lite: thu/chi tổng quát (cash_transactions)
// ----------------------------------------------------------------------------

export type CashTransactionType = 0 | 1 // 0=thu, 1=chi

export interface CashTransaction {
  id: number
  shift_id: number | null   // NULL = ngoài ca
  type: CashTransactionType
  amount_cents: number      // cents > 0
  category: string | null   // 'purchase','salary','rent','other',...
  note: string | null
  created_at: number
  created_by: number | null
}

export interface CreateCashTransactionInput {
  shift_id?: number | null
  type: CashTransactionType
  amount_cents: number
  category?: string | null
  note?: string
  created_by?: number | null
}

// ----------------------------------------------------------------------------
// P0.3 / P2.6 — Thẻ kho + cấu hình cửa hàng
// ----------------------------------------------------------------------------

/** Dòng lịch sử tồn kho cho dialog "Thẻ kho" (products:listMovements). */
export interface StockMovement {
  id: number
  product_id: number
  type: StockMovementType  // 0=sale, 1=return, 2=purchase, 3=adjust, 4=wastage
  delta: number            // +/- số lượng (bán = âm)
  order_id: number | null
  /** Có từ migration thêm cột (P2). */
  variant_id?: number | null
  batch_id?: number | null
  note: string | null
  created_at: number
  created_by: number
  /** Joined cho UI. */
  user_name?: string
  invoice_no?: number | null
}

/** Cấu hình cửa hàng (app_settings): thông tin in lên hóa đơn 80mm (P0.3) và
 *  thông tin hộ KD cho HĐĐT giai đoạn 1 (P2.6): store_name, store_address,
 *  store_phone, store_tax_code, receipt_footer... Value là TEXT (JSON nếu cần). */
export interface AppSetting {
  key: string
  value: string
  updated_at: number
}
