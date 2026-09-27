import { ipcMain } from 'electron'
import * as suppliersRepo from '../db/repositories/suppliers.js'
import type { CreateSupplierInput, ListSuppliersOptions } from '../db/repositories/suppliers.js'
import type { UpdateSupplierInput } from '@shared/types'

export function registerSuppliersIpc(): void {
  ipcMain.handle('suppliers:list', (_e, opts: ListSuppliersOptions = {}) =>
    suppliersRepo.list(opts)
  )
  ipcMain.handle('suppliers:getSummary', () => suppliersRepo.getSummary())
  ipcMain.handle('suppliers:getById', (_e, id: number) =>
    suppliersRepo.getById(id)
  )
  ipcMain.handle('suppliers:getByPhone', (_e, phone: string) =>
    suppliersRepo.getByPhone(phone)
  )
  ipcMain.handle('suppliers:create', (_e, input: CreateSupplierInput) =>
    suppliersRepo.create(input)
  )
  ipcMain.handle('suppliers:update', (_e, id: number, input: UpdateSupplierInput) =>
    suppliersRepo.update(id, input)
  )
  ipcMain.handle('suppliers:deactivate', (_e, id: number) =>
    suppliersRepo.deactivate(id)
  )
  ipcMain.handle('suppliers:recordPayment', (_e, params: {
    supplierId: number
    amount: number
    userId: number
    note?: string | null
    poId?: number | null
  }) => suppliersRepo.recordPayment(params))
  ipcMain.handle('suppliers:adjustBalance', (_e, params: {
    supplierId: number
    amount: number
    userId: number
    note: string
  }) => suppliersRepo.adjustBalance(params))
  ipcMain.handle('suppliers:getLedger', (_e, supplierId: number, limit = 100) =>
    suppliersRepo.getLedger(supplierId, limit)
  )
}
