// ============================================================================
//  Postie POS - IPC handlers
// ----------------------------------------------------------------------------
//  Registers typed IPC handlers that bridge the renderer to the repositories.
//  All DB access happens here in the main process; the renderer never touches
//  better-sqlite3 directly.
// ============================================================================

import { ipcMain } from 'electron'
import * as usersRepo from './db/repositories/users.js'
import * as productsRepo from './db/repositories/products.js'
import * as ordersRepo from './db/repositories/orders.js'
import * as shiftsRepo from './db/repositories/shifts.js'
import * as customersRepo from './db/repositories/customers.js'
import * as paymentMethodsRepo from './db/repositories/payment-methods.js'
import { getDb, needsFirstRunSetup, initializeDatabase } from './db/connection.js'
import type {
  CreateOrderInput,
  CreateProductInput,
  UpdateProductInput,
  StockMovementType,
  ListProductsOptions,
  Product,
  Shift
} from '../src/shared/types.js'
import type {
  ListCustomersOptions,
  CreateCustomerInput
} from './db/repositories/customers.js'

export function registerIpc(): void {
  // ---- First-run setup -----------------------------------------------------
  // Replaces the old `electron . --init-db` CLI flow (readline password
  // prompt), which cannot work once the app is launched as a packaged .exe.
  // The renderer checks db:needsSetup on startup and, if true, shows a
  // FirstRunSetup screen that calls db:initialize with a password the store
  // owner types into a normal form.
  ipcMain.handle('db:needsSetup', () => needsFirstRunSetup())
  ipcMain.handle('db:initialize', (_e, adminPassword: string) => {
    initializeDatabase(adminPassword)
    return true
  })
  ipcMain.handle('db:isReady', () => {
    try {
      getDb()
      return true
    } catch {
      return false
    }
  })

  // ---- Users -------------------------------------------------------------
  ipcMain.handle('users:login', (_e, username: string, password: string) =>
    usersRepo.login(username, password)
  )
  ipcMain.handle('users:autoLogin', () => usersRepo.getDefaultAdmin())
  ipcMain.handle('users:list', () => usersRepo.listAll())
  ipcMain.handle('users:getById', (_e, id: number) => usersRepo.getById(id))

  // ---- Products ----------------------------------------------------------
  ipcMain.handle('products:list', (_e, opts: ListProductsOptions = {}) =>
    productsRepo.list(opts)
  )
  ipcMain.handle('products:getById', (_e, id: number) =>
    productsRepo.getById(id)
  )
  ipcMain.handle('products:getByBarcode', (_e, barcode: string) =>
    productsRepo.getByBarcode(barcode)
  )
  ipcMain.handle('products:create', (_e, input: CreateProductInput) =>
    productsRepo.create(input)
  )
  ipcMain.handle('products:update', (_e, id: number, input: UpdateProductInput) =>
    productsRepo.update(id, input)
  )
  ipcMain.handle('products:deactivate', (_e, id: number) =>
    productsRepo.deactivate(id)
  )
  ipcMain.handle('products:adjustStock', (_e, params: {
    productId: number
    delta: number
    type: StockMovementType
    note?: string | null
    userId: number
  }): Product => {
    productsRepo.adjustStock({
      productId: params.productId,
      delta: params.delta,
      type: params.type,
      note: params.note,
      userId: params.userId
    })
    return productsRepo.getById(params.productId) as Product
  })

  // ---- Orders ------------------------------------------------------------
  ipcMain.handle('orders:create', (_e, input: CreateOrderInput) =>
    ordersRepo.create(input)
  )
  ipcMain.handle('orders:getById', (_e, id: number) =>
    ordersRepo.getById(id)
  )
  ipcMain.handle('orders:listRecent', (_e, limit = 50) =>
    ordersRepo.listRecent(limit)
  )
  ipcMain.handle('orders:listByShift', (_e, shiftId: number, limit = 200) =>
    ordersRepo.listByShift(shiftId, limit)
  )

  // ---- Shifts ------------------------------------------------------------
  ipcMain.handle('shifts:open', (_e, userId: number, openingCash: number): Shift =>
    shiftsRepo.open(userId, openingCash)
  )
  ipcMain.handle('shifts:close', (_e, shiftId: number, countedCash: number): Shift =>
    shiftsRepo.close(shiftId, countedCash)
  )
  ipcMain.handle('shifts:getActive', (_e, userId: number): Shift | undefined =>
    shiftsRepo.getActive(userId)
  )
  ipcMain.handle('shifts:getById', (_e, id: number): Shift | undefined =>
    shiftsRepo.getById(id)
  )

  // ---- Customers (credit / debt) -----------------------------------------
  ipcMain.handle('customers:list', (_e, opts: ListCustomersOptions = {}) =>
    customersRepo.list(opts)
  )
  ipcMain.handle('customers:getById', (_e, id: number) =>
    customersRepo.getById(id)
  )
  ipcMain.handle('customers:getByPhone', (_e, phone: string) =>
    customersRepo.getByPhone(phone)
  )
  ipcMain.handle('customers:create', (_e, input: CreateCustomerInput) =>
    customersRepo.create(input)
  )
  ipcMain.handle('customers:recordPayment', (_e, customerId: number, amount: number, userId: number, note?: string) =>
    customersRepo.recordPayment({ customerId, amount, userId, note })
  )
  ipcMain.handle('customers:getLedger', (_e, customerId: number, limit = 100) =>
    customersRepo.getLedger(customerId, limit)
  )

  // ---- Payment methods ---------------------------------------------------
  ipcMain.handle('payment_methods:list', () => paymentMethodsRepo.list())
}
