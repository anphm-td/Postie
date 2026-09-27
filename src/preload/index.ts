// ============================================================================
//  Postie POS - Preload script
// ----------------------------------------------------------------------------
//  Exposes a minimal, typed `window.postieAPI` to the renderer via
//  contextBridge. The renderer calls these methods; ipc.ts handles them in
//  the main process. No Node/Electron APIs leak to the renderer.
// ============================================================================

import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateProductInput,
  UpdateProductInput,
  ListProductsOptions,
  ListOrdersOptions,
  OrderListResult,
  Product,
  ProductListResult,
  Order,
  HeldBill,
  Shift,
  User,
  Customer,
  CustomerLedgerEntry,
  CustomerSummary,
  UpdateCustomerInput,
  PaymentMethod,
  StockMovementType,
  StockMovement,
  Category,
  Promotion,
  CreatePromotionInput,
  Voucher,
  CreateVoucherInput,
  Supplier,
  SupplierSummary,
  SupplierLedgerEntry,
  UpdateSupplierInput,
  PurchaseOrder,
  CreatePurchaseOrderInput,
  Stocktake,
  StocktakeDetailRow,
  StocktakeDetailInput,
  CreateStocktakeInput,
  CompleteStocktakeInput,
  ShiftCashEvent,
  CreateShiftCashEventInput,
  ImportPickResult,
  ImportRowPreview,
  ImportCommitResult
} from '@shared/types'
import type {
  ListCustomersOptions,
  CustomerListResult,
  CreateCustomerInput
} from '../backend/db/repositories/customers.js'
import type {
  CreateOrderWithPromotionsInput,
  ConvertHeldOrderInput,
  HoldOrderInput,
  UpdateHeldOrderInput,
  VietQRParams
} from '../backend/db/repositories/orders.js'
import type {
  CartDiscountResult,
  CartPreviewResult,
  EvaluateCartParams,
  ListPromotionsOptions,
  ListVouchersOptions,
  PagedResult
} from '../backend/db/repositories/promotions.js'
import type { CreateReturnInput, ReturnRow } from '../backend/db/repositories/returns.js'
import type {
  CreateCategoryInput,
  ListCategoriesOptions,
  UpdateCategoryInput
} from '../backend/db/repositories/categories.js'
import type {
  CreateSupplierInput,
  ListSuppliersOptions,
  SupplierListResult
} from '../backend/db/repositories/suppliers.js'
import type {
  ListPurchaseOrdersOptions,
  ReceivePurchaseInput,
  ReceivedLine
} from '../backend/db/repositories/purchases.js'
import type { ListStocktakesOptions } from '../backend/db/repositories/stocktakes.js'
import type {
  CategoryRevenueRow,
  DailyRevenueRow,
  PaymentMethodRevenueRow,
  ProductReportOptions,
  ProductRevenueRow,
  ReportRange,
  SalesSummary,
  ShiftRevenueRow,
  StockReportOptions,
  StockReportResult,
  UserRevenueRow
} from '../backend/db/repositories/reports.js'
import type { ShiftListOptions, ShiftWithUser } from '../backend/db/repositories/shifts.js'
// products.getStockReport trả về StockReportSummary CỦA products repo (có
// low_stock/out_of_stock) — khác reports.StockReportResult/Summary, nên alias.
import type { StockReportSummary as ProductStockReportSummary } from '../backend/db/repositories/products.js'

export interface PostieAPI {
  db: {
    isReady: () => Promise<boolean>
    needsSetup: () => Promise<boolean>
    initialize: (password: string) => Promise<boolean>
  }
  users: {
    login: (username: string, password: string) => Promise<User | null>
    getById: (id: number) => Promise<User | undefined>
    list: () => Promise<User[]>
  }
  products: {
    list: (opts?: ListProductsOptions) => Promise<ProductListResult>
    getById: (id: number) => Promise<Product | undefined>
    getByBarcode: (barcode: string) => Promise<Product | undefined>
    create: (input: CreateProductInput) => Promise<Product>
    update: (id: number, input: UpdateProductInput) => Promise<Product>
    deactivate: (id: number) => Promise<Product>
    adjustStock: (params: {
      productId: number
      delta: number
      type: StockMovementType
      note?: string | null
      userId: number
    }) => Promise<Product>
    /** Điều chỉnh tồn thủ công (type=3, delta signed, bắt buộc lý do). */
    manualAdjust: (params: {
      productId: number
      delta: number
      userId: number
      note: string
    }) => Promise<Product>
    /** Hao hụt / hàng hỏng (type=4, qty > 0, delta âm). */
    wastage: (params: {
      productId: number
      qty: number
      userId: number
      note?: string | null
    }) => Promise<Product>
    /** Thẻ kho: lịch sử tồn của 1 SP (join user_name, invoice_no). */
    listMovements: (productId: number, limit?: number) => Promise<StockMovement[]>
    listLowStock: () => Promise<Product[]>
    /** Tổng hợp tồn: số SP, giá trị kho + danh sách sắp hết / hết hàng. */
    getStockReport: () => Promise<ProductStockReportSummary>
    importPick: () => Promise<ImportPickResult | null>
    importTemplate: () => Promise<string | null>
    importCommit: (rows: ImportRowPreview[], userId: number) => Promise<ImportCommitResult>
  }
  orders: {
    /** create nhận input mở rộng: engine khuyến mại + voucher_code (đốt trong tx). */
    create: (input: CreateOrderWithPromotionsInput) => Promise<Order>
    getById: (id: number) => Promise<Order | undefined>
    listRecent: (limit?: number) => Promise<Order[]>
    listByShift: (shiftId: number, limit?: number) => Promise<Order[]>
    list: (opts?: ListOrdersOptions) => Promise<OrderListResult>
    /** Hủy đơn (P0.3): status=2 + trả tồn + xóa nợ + nhả voucher + audit_log. */
    voidOrder: (id: number, userId: number, reason?: string) => Promise<Order>
    /** Giữ đơn (P1.5): snapshot giá + KM + voucher, KHÔNG trừ tồn / nhận tiền. */
    hold: (input: HoldOrderInput) => Promise<Order>
    updateHeld: (id: number, input: UpdateHeldOrderInput) => Promise<Order>
    /** Chuyển đơn treo thành hóa đơn: payments split-tender + trừ tồn. */
    convertHeld: (id: number, params: ConvertHeldOrderInput) => Promise<Order>
    listHeld: (limit?: number) => Promise<HeldBill[]>
    getByInvoiceNo: (invoiceNo: number) => Promise<Order | undefined>
    /** VietQR tĩnh (P1.6 — stub): chuỗi payload EMVCo để UI vẽ hình QR. */
    buildVietQRPayload: (params: VietQRParams) => Promise<string>
  }
  shifts: {
    open: (userId: number, openingCash: number) => Promise<Shift>
    close: (shiftId: number, countedCash: number) => Promise<Shift>
    getActive: (userId: number) => Promise<Shift | undefined>
    getById: (id: number) => Promise<Shift | undefined>
    /** Lịch sử ca kèm tên thu ngân (P0.4). */
    list: (opts?: ShiftListOptions) => Promise<ShiftWithUser[]>
    listByUser: (userId: number, opts?: Omit<ShiftListOptions, 'userId'>) => Promise<ShiftWithUser[]>
    /** Thu (type 0) / chi (type 1) tiền mặt trong ca — chỉ trên ca ĐANG MỞ. */
    addCashEvent: (input: CreateShiftCashEventInput) => Promise<ShiftCashEvent>
    listCashEvents: (shiftId: number, limit?: number) => Promise<ShiftCashEvent[]>
    getCashEventTotals: (shiftId: number) => Promise<{ cash_in: number; cash_out: number; net: number }>
  }
  promotions: {
    list: (opts?: ListPromotionsOptions) => Promise<PagedResult<Promotion>>
    getById: (id: number) => Promise<Promotion | undefined>
    create: (input: CreatePromotionInput) => Promise<Promotion>
    update: (id: number, input: Partial<CreatePromotionInput> & { is_active?: number }) => Promise<Promotion>
    deactivate: (id: number) => Promise<Promotion>
    /** Engine khuyến mại (chỉ đọc): giảm theo dòng + giảm toàn đơn. */
    resolveCartDiscounts: (params: EvaluateCartParams) => Promise<CartDiscountResult>
    /** Preview "Hộp quà": engine + kiểm tra mã voucher (không đốt). */
    previewCartDiscounts: (params: EvaluateCartParams & { voucher_code?: string }) => Promise<CartPreviewResult>
  }
  vouchers: {
    list: (opts?: ListVouchersOptions) => Promise<PagedResult<Voucher>>
    getById: (id: number) => Promise<Voucher | undefined>
    create: (input: CreateVoucherInput) => Promise<Voucher>
    deactivate: (id: number) => Promise<Voucher>
    /** Tra cứu voucher để áp dụng — throw tiếng Việt nếu mã lỗi. */
    findForRedemption: (code: string, opts?: { now?: number; allowUsedByOrderId?: number }) => Promise<Voucher>
    /** LƯU Ý: luồng bán hàng bình thường đốt/nhả voucher NỘI BỘ trong tx của
     *  orders:create/hold và orders:voidOrder / returns:createReturn. */
    redeem: (voucherId: number, orderId: number, allowUsedByOrderId?: number) => Promise<void>
    release: (orderId: number) => Promise<void>
  }
  categories: {
    list: (opts?: ListCategoriesOptions) => Promise<Category[]>
    getById: (id: number) => Promise<Category | undefined>
    create: (input: CreateCategoryInput) => Promise<Category>
    update: (id: number, input: UpdateCategoryInput) => Promise<Category>
    deactivate: (id: number) => Promise<Category>
  }
  suppliers: {
    list: (opts?: ListSuppliersOptions) => Promise<SupplierListResult>
    getSummary: () => Promise<SupplierSummary>
    getById: (id: number) => Promise<Supplier | undefined>
    getByPhone: (phone: string) => Promise<Supplier | undefined>
    create: (input: CreateSupplierInput) => Promise<Supplier>
    update: (id: number, input: UpdateSupplierInput) => Promise<Supplier>
    deactivate: (id: number) => Promise<Supplier>
    /** Trả tiền NCC (ledger type=1 âm); poId tùy chọn để đối chiếu phiếu nhập. */
    recordPayment: (params: {
      supplierId: number
      amount: number
      userId: number
      note?: string | null
      poId?: number | null
    }) => Promise<Supplier>
    /** Điều chỉnh công nợ thủ công (type=2, signed, bắt buộc lý do). */
    adjustBalance: (params: {
      supplierId: number
      amount: number
      userId: number
      note: string
    }) => Promise<Supplier>
    getLedger: (supplierId: number, limit?: number) => Promise<SupplierLedgerEntry[]>
  }
  purchases: {
    create: (input: CreatePurchaseOrderInput) => Promise<PurchaseOrder>
    /** Nhận hàng một phần/đủ, nhiều lần — 1 transaction trong repo. */
    receive: (params: ReceivePurchaseInput) => Promise<PurchaseOrder>
    cancel: (poId: number) => Promise<PurchaseOrder>
    getReceivedLines: (poId: number) => Promise<ReceivedLine[]>
    getById: (id: number) => Promise<PurchaseOrder | undefined>
    list: (opts?: ListPurchaseOrdersOptions) => Promise<PurchaseOrder[]>
  }
  stocktakes: {
    open: (userId: number, input?: CreateStocktakeInput) => Promise<Stocktake>
    addLine: (stocktakeId: number, input: StocktakeDetailInput) => Promise<StocktakeDetailRow>
    removeLine: (stocktakeId: number, detailId: number) => Promise<void>
    getById: (id: number) => Promise<Stocktake | undefined>
    list: (opts?: ListStocktakesOptions) => Promise<Stocktake[]>
    /** Hoàn thành: sinh movements type=3 delta = counted − book (cho phép âm). */
    complete: (input: CompleteStocktakeInput) => Promise<Stocktake>
    cancel: (id: number) => Promise<Stocktake>
  }
  returns: {
    createReturn: (input: CreateReturnInput) => Promise<ReturnRow>
    getById: (id: number) => Promise<ReturnRow | undefined>
    listByOrder: (orderId: number) => Promise<ReturnRow[]>
    listRecent: (limit?: number) => Promise<ReturnRow[]>
  }
  reports: {
    getSalesSummary: (range?: ReportRange) => Promise<SalesSummary>
    revenueByDay: (range?: ReportRange) => Promise<DailyRevenueRow[]>
    revenueByShift: (range?: ReportRange) => Promise<ShiftRevenueRow[]>
    revenueByUser: (range?: ReportRange) => Promise<UserRevenueRow[]>
    revenueByProduct: (opts?: ProductReportOptions) => Promise<ProductRevenueRow[]>
    topProducts: (opts?: ProductReportOptions) => Promise<ProductRevenueRow[]>
    revenueByCategory: (range?: ReportRange) => Promise<CategoryRevenueRow[]>
    revenueByPaymentMethod: (range?: ReportRange) => Promise<PaymentMethodRevenueRow[]>
    stockReport: (opts?: StockReportOptions) => Promise<StockReportResult>
  }
  customers: {
    list: (opts?: ListCustomersOptions) => Promise<CustomerListResult>
    getSummary: () => Promise<CustomerSummary>
    getById: (id: number) => Promise<Customer | undefined>
    getByPhone: (phone: string) => Promise<Customer | undefined>
    create: (input: CreateCustomerInput) => Promise<Customer>
    update: (id: number, input: UpdateCustomerInput) => Promise<Customer>
    deactivate: (id: number) => Promise<Customer>
    recordPayment: (customerId: number, amount: number, userId: number, note?: string) => Promise<Customer>
    adjustBalance: (params: {
      customerId: number
      amount: number
      userId: number
      note: string
    }) => Promise<Customer>
    getLedger: (customerId: number, limit?: number) => Promise<CustomerLedgerEntry[]>
  }
  payment_methods: {
    list: () => Promise<PaymentMethod[]>
  }
}

const api: PostieAPI = {
  db: {
    isReady: () => ipcRenderer.invoke('db:isReady'),
    needsSetup: () => ipcRenderer.invoke('db:needsSetup'),
    initialize: (password) => ipcRenderer.invoke('db:initialize', password)
  },
  users: {
    login: (u, p) => ipcRenderer.invoke('users:login', u, p),
    getById: (id) => ipcRenderer.invoke('users:getById', id),
    list: () => ipcRenderer.invoke('users:list')
  },
  products: {
    list: (opts) => ipcRenderer.invoke('products:list', opts ?? {}),
    getById: (id) => ipcRenderer.invoke('products:getById', id),
    getByBarcode: (bc) => ipcRenderer.invoke('products:getByBarcode', bc),
    create: (input) => ipcRenderer.invoke('products:create', input),
    update: (id, input) => ipcRenderer.invoke('products:update', id, input),
    deactivate: (id) => ipcRenderer.invoke('products:deactivate', id),
    adjustStock: (params) => ipcRenderer.invoke('products:adjustStock', params),
    manualAdjust: (params) => ipcRenderer.invoke('products:manualAdjust', params),
    wastage: (params) => ipcRenderer.invoke('products:wastage', params),
    listMovements: (productId, limit) => ipcRenderer.invoke('products:listMovements', productId, limit),
    listLowStock: () => ipcRenderer.invoke('products:listLowStock'),
    getStockReport: () => ipcRenderer.invoke('products:getStockReport'),
    importPick: () => ipcRenderer.invoke('products:importPick'),
    importTemplate: () => ipcRenderer.invoke('products:importTemplate'),
    importCommit: (rows, userId) => ipcRenderer.invoke('products:importCommit', rows, userId)
  },
  promotions: {
    list: (opts) => ipcRenderer.invoke('promotions:list', opts ?? {}),
    getById: (id) => ipcRenderer.invoke('promotions:getById', id),
    create: (input) => ipcRenderer.invoke('promotions:create', input),
    update: (id, input) => ipcRenderer.invoke('promotions:update', id, input),
    deactivate: (id) => ipcRenderer.invoke('promotions:deactivate', id),
    resolveCartDiscounts: (params) => ipcRenderer.invoke('promotions:resolveCartDiscounts', params),
    previewCartDiscounts: (params) => ipcRenderer.invoke('promotions:previewCartDiscounts', params)
  },
  vouchers: {
    list: (opts) => ipcRenderer.invoke('vouchers:list', opts ?? {}),
    getById: (id) => ipcRenderer.invoke('vouchers:getById', id),
    create: (input) => ipcRenderer.invoke('vouchers:create', input),
    deactivate: (id) => ipcRenderer.invoke('vouchers:deactivate', id),
    findForRedemption: (code, opts) => ipcRenderer.invoke('vouchers:findForRedemption', code, opts),
    redeem: (voucherId, orderId, allowUsedByOrderId) =>
      ipcRenderer.invoke('vouchers:redeem', voucherId, orderId, allowUsedByOrderId),
    release: (orderId) => ipcRenderer.invoke('vouchers:release', orderId)
  },
  categories: {
    list: (opts) => ipcRenderer.invoke('categories:list', opts ?? {}),
    getById: (id) => ipcRenderer.invoke('categories:getById', id),
    create: (input) => ipcRenderer.invoke('categories:create', input),
    update: (id, input) => ipcRenderer.invoke('categories:update', id, input),
    deactivate: (id) => ipcRenderer.invoke('categories:deactivate', id)
  },
  suppliers: {
    list: (opts) => ipcRenderer.invoke('suppliers:list', opts ?? {}),
    getSummary: () => ipcRenderer.invoke('suppliers:getSummary'),
    getById: (id) => ipcRenderer.invoke('suppliers:getById', id),
    getByPhone: (phone) => ipcRenderer.invoke('suppliers:getByPhone', phone),
    create: (input) => ipcRenderer.invoke('suppliers:create', input),
    update: (id, input) => ipcRenderer.invoke('suppliers:update', id, input),
    deactivate: (id) => ipcRenderer.invoke('suppliers:deactivate', id),
    recordPayment: (params) => ipcRenderer.invoke('suppliers:recordPayment', params),
    adjustBalance: (params) => ipcRenderer.invoke('suppliers:adjustBalance', params),
    getLedger: (supplierId, limit) => ipcRenderer.invoke('suppliers:getLedger', supplierId, limit)
  },
  purchases: {
    create: (input) => ipcRenderer.invoke('purchases:create', input),
    receive: (params) => ipcRenderer.invoke('purchases:receive', params),
    cancel: (poId) => ipcRenderer.invoke('purchases:cancel', poId),
    getReceivedLines: (poId) => ipcRenderer.invoke('purchases:getReceivedLines', poId),
    getById: (id) => ipcRenderer.invoke('purchases:getById', id),
    list: (opts) => ipcRenderer.invoke('purchases:list', opts ?? {})
  },
  stocktakes: {
    open: (userId, input) => ipcRenderer.invoke('stocktakes:open', userId, input ?? {}),
    addLine: (stocktakeId, input) => ipcRenderer.invoke('stocktakes:addLine', stocktakeId, input),
    removeLine: (stocktakeId, detailId) => ipcRenderer.invoke('stocktakes:removeLine', stocktakeId, detailId),
    getById: (id) => ipcRenderer.invoke('stocktakes:getById', id),
    list: (opts) => ipcRenderer.invoke('stocktakes:list', opts ?? {}),
    complete: (input) => ipcRenderer.invoke('stocktakes:complete', input),
    cancel: (id) => ipcRenderer.invoke('stocktakes:cancel', id)
  },
  returns: {
    createReturn: (input) => ipcRenderer.invoke('returns:createReturn', input),
    getById: (id) => ipcRenderer.invoke('returns:getById', id),
    listByOrder: (orderId) => ipcRenderer.invoke('returns:listByOrder', orderId),
    listRecent: (limit) => ipcRenderer.invoke('returns:listRecent', limit)
  },
  reports: {
    getSalesSummary: (range) => ipcRenderer.invoke('reports:getSalesSummary', range ?? {}),
    revenueByDay: (range) => ipcRenderer.invoke('reports:revenueByDay', range ?? {}),
    revenueByShift: (range) => ipcRenderer.invoke('reports:revenueByShift', range ?? {}),
    revenueByUser: (range) => ipcRenderer.invoke('reports:revenueByUser', range ?? {}),
    revenueByProduct: (opts) => ipcRenderer.invoke('reports:revenueByProduct', opts ?? {}),
    topProducts: (opts) => ipcRenderer.invoke('reports:topProducts', opts ?? {}),
    revenueByCategory: (range) => ipcRenderer.invoke('reports:revenueByCategory', range ?? {}),
    revenueByPaymentMethod: (range) => ipcRenderer.invoke('reports:revenueByPaymentMethod', range ?? {}),
    stockReport: (opts) => ipcRenderer.invoke('reports:stockReport', opts ?? {})
  },
  orders: {
    create: (input) => ipcRenderer.invoke('orders:create', input),
    getById: (id) => ipcRenderer.invoke('orders:getById', id),
    listRecent: (limit) => ipcRenderer.invoke('orders:listRecent', limit),
    listByShift: (shiftId, limit) => ipcRenderer.invoke('orders:listByShift', shiftId, limit),
    list: (opts) => ipcRenderer.invoke('orders:list', opts ?? {}),
    voidOrder: (id, userId, reason) => ipcRenderer.invoke('orders:voidOrder', id, userId, reason),
    hold: (input) => ipcRenderer.invoke('orders:hold', input),
    updateHeld: (id, input) => ipcRenderer.invoke('orders:updateHeld', id, input),
    convertHeld: (id, params) => ipcRenderer.invoke('orders:convertHeld', id, params),
    listHeld: (limit) => ipcRenderer.invoke('orders:listHeld', limit),
    getByInvoiceNo: (invoiceNo) => ipcRenderer.invoke('orders:getByInvoiceNo', invoiceNo),
    buildVietQRPayload: (params) => ipcRenderer.invoke('orders:buildVietQRPayload', params)
  },
  shifts: {
    open: (uid, cash) => ipcRenderer.invoke('shifts:open', uid, cash),
    close: (sid, cash) => ipcRenderer.invoke('shifts:close', sid, cash),
    getActive: (uid) => ipcRenderer.invoke('shifts:getActive', uid),
    getById: (id) => ipcRenderer.invoke('shifts:getById', id),
    list: (opts) => ipcRenderer.invoke('shifts:list', opts ?? {}),
    listByUser: (userId, opts) => ipcRenderer.invoke('shifts:listByUser', userId, opts ?? {}),
    addCashEvent: (input) => ipcRenderer.invoke('shifts:addCashEvent', input),
    listCashEvents: (shiftId, limit) => ipcRenderer.invoke('shifts:listCashEvents', shiftId, limit),
    getCashEventTotals: (shiftId) => ipcRenderer.invoke('shifts:getCashEventTotals', shiftId)
  },
  customers: {
    list: (opts) => ipcRenderer.invoke('customers:list', opts ?? {}),
    getSummary: () => ipcRenderer.invoke('customers:getSummary'),
    getById: (id) => ipcRenderer.invoke('customers:getById', id),
    getByPhone: (phone) => ipcRenderer.invoke('customers:getByPhone', phone),
    create: (input) => ipcRenderer.invoke('customers:create', input),
    update: (id, input) => ipcRenderer.invoke('customers:update', id, input),
    deactivate: (id) => ipcRenderer.invoke('customers:deactivate', id),
    recordPayment: (cid, amt, uid, note) => ipcRenderer.invoke('customers:recordPayment', cid, amt, uid, note),
    adjustBalance: (params) => ipcRenderer.invoke('customers:adjustBalance', params),
    getLedger: (cid, limit) => ipcRenderer.invoke('customers:getLedger', cid, limit)
  },
  payment_methods: {
    list: () => ipcRenderer.invoke('payment_methods:list')
  }
}

contextBridge.exposeInMainWorld('postieAPI', api)
