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
}

export interface Product {
  id: number
  barcode: string | null
  name: string
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
  category_id?: number | null
  supplier_id?: number | null
  price: number
  cost?: number
  tax_id?: number | null
  unit?: string | null
  stock?: number
  low_stock_alert?: number
}

/** Partial update for an existing product. `stock` is intentionally absent —
 *  it is a derived column; use a stock movement (adjustStock) to change it. */
export interface UpdateProductInput {
  barcode?: string | null
  name?: string
  category_id?: number | null
  supplier_id?: number | null
  price?: number
  cost?: number
  tax_id?: number | null
  unit?: string | null
  low_stock_alert?: number
  is_active?: number
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
  unit_price: number
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
  discount_reason: string | null
  note: string | null
  created_at: number
  details?: OrderDetailRow[]
  payments?: OrderPaymentRow[]
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
