// ============================================================================
//  Postie POS - Preload script
// ----------------------------------------------------------------------------
//  Exposes a minimal, typed `window.postieAPI` to the renderer via
//  contextBridge. The renderer calls these methods; ipc.ts handles them in
//  the main process. No Node/Electron APIs leak to the renderer.
// ============================================================================

import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateOrderInput,
  CreateProductInput,
  UpdateProductInput,
  ListProductsOptions,
  Product,
  ProductListResult,
  Order,
  Shift,
  User,
  Customer,
  CustomerLedgerEntry,
  PaymentMethod,
  StockMovementType
} from '../src/shared/types.js'
import type {
  ListCustomersOptions,
  CustomerListResult,
  CreateCustomerInput
} from './db/repositories/customers.js'

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
  }
  orders: {
    create: (input: CreateOrderInput) => Promise<Order>
    getById: (id: number) => Promise<Order | undefined>
    listRecent: (limit?: number) => Promise<Order[]>
    listByShift: (shiftId: number, limit?: number) => Promise<Order[]>
  }
  shifts: {
    open: (userId: number, openingCash: number) => Promise<Shift>
    close: (shiftId: number, countedCash: number) => Promise<Shift>
    getActive: (userId: number) => Promise<Shift | undefined>
    getById: (id: number) => Promise<Shift | undefined>
  }
  customers: {
    list: (opts?: ListCustomersOptions) => Promise<CustomerListResult>
    getById: (id: number) => Promise<Customer | undefined>
    getByPhone: (phone: string) => Promise<Customer | undefined>
    create: (input: CreateCustomerInput) => Promise<Customer>
    recordPayment: (customerId: number, amount: number, userId: number, note?: string) => Promise<Customer>
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
    adjustStock: (params) => ipcRenderer.invoke('products:adjustStock', params)
  },
  orders: {
    create: (input) => ipcRenderer.invoke('orders:create', input),
    getById: (id) => ipcRenderer.invoke('orders:getById', id),
    listRecent: (limit) => ipcRenderer.invoke('orders:listRecent', limit),
    listByShift: (shiftId, limit) => ipcRenderer.invoke('orders:listByShift', shiftId, limit)
  },
  shifts: {
    open: (uid, cash) => ipcRenderer.invoke('shifts:open', uid, cash),
    close: (sid, cash) => ipcRenderer.invoke('shifts:close', sid, cash),
    getActive: (uid) => ipcRenderer.invoke('shifts:getActive', uid),
    getById: (id) => ipcRenderer.invoke('shifts:getById', id)
  },
  customers: {
    list: (opts) => ipcRenderer.invoke('customers:list', opts ?? {}),
    getById: (id) => ipcRenderer.invoke('customers:getById', id),
    getByPhone: (phone) => ipcRenderer.invoke('customers:getByPhone', phone),
    create: (input) => ipcRenderer.invoke('customers:create', input),
    recordPayment: (cid, amt, uid, note) => ipcRenderer.invoke('customers:recordPayment', cid, amt, uid, note),
    getLedger: (cid, limit) => ipcRenderer.invoke('customers:getLedger', cid, limit)
  },
  payment_methods: {
    list: () => ipcRenderer.invoke('payment_methods:list')
  }
}

contextBridge.exposeInMainWorld('postieAPI', api)
