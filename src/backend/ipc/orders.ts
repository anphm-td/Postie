import { ipcMain } from 'electron'
import * as ordersRepo from '../db/repositories/orders.js'
import type {
  CreateOrderWithPromotionsInput,
  HoldOrderInput,
  UpdateHeldOrderInput,
  ConvertHeldOrderInput,
  VietQRParams
} from '../db/repositories/orders.js'
import type { ListOrdersOptions } from '@shared/types'

export function registerOrdersIpc(): void {
  ipcMain.handle('orders:create', (_e, input: CreateOrderWithPromotionsInput) =>
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
  ipcMain.handle('orders:list', (_e, opts: ListOrdersOptions = {}) => ordersRepo.list(opts))

  ipcMain.handle('orders:voidOrder', (_e, id: number, userId: number, reason?: string) =>
    ordersRepo.voidOrder(id, userId, reason)
  )

  ipcMain.handle('orders:hold', (_e, input: HoldOrderInput) =>
    ordersRepo.hold(input)
  )
  ipcMain.handle('orders:updateHeld', (_e, id: number, input: UpdateHeldOrderInput) =>
    ordersRepo.updateHeld(id, input)
  )
  ipcMain.handle('orders:convertHeld', (_e, id: number, params: ConvertHeldOrderInput) =>
    ordersRepo.convertHeld(id, params)
  )
  ipcMain.handle('orders:listHeld', (_e, limit = 100) =>
    ordersRepo.listHeld(limit)
  )

  ipcMain.handle('orders:getByInvoiceNo', (_e, invoiceNo: number) =>
    ordersRepo.getByInvoiceNo(invoiceNo)
  )

  ipcMain.handle('orders:buildVietQRPayload', (_e, params: VietQRParams) =>
    ordersRepo.buildVietQRPayload(params)
  )
}
