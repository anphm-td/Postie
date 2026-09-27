import { ipcMain } from 'electron'
import * as customersRepo from '../db/repositories/customers.js'
import type { UpdateCustomerInput } from '@shared/types'
import type { ListCustomersOptions, CreateCustomerInput } from '../db/repositories/customers.js'

export function registerCustomersIpc(): void {
  ipcMain.handle('customers:list', (_e, opts: ListCustomersOptions = {}) =>
    customersRepo.list(opts)
  )
  ipcMain.handle('customers:getSummary', () => customersRepo.getSummary())
  ipcMain.handle('customers:getById', (_e, id: number) =>
    customersRepo.getById(id)
  )
  ipcMain.handle('customers:getByPhone', (_e, phone: string) =>
    customersRepo.getByPhone(phone)
  )
  ipcMain.handle('customers:create', (_e, input: CreateCustomerInput) =>
    customersRepo.create(input)
  )
  ipcMain.handle('customers:update', (_e, id: number, input: UpdateCustomerInput) =>
    customersRepo.update(id, input)
  )
  ipcMain.handle('customers:deactivate', (_e, id: number) =>
    customersRepo.deactivate(id)
  )
  ipcMain.handle('customers:recordPayment', (_e, customerId: number, amount: number, userId: number, note?: string) =>
    customersRepo.recordPayment({ customerId, amount, userId, note })
  )
  ipcMain.handle('customers:adjustBalance', (_e, params: {
    customerId: number
    amount: number
    userId: number
    note: string
  }) => customersRepo.adjustBalance(params))
  ipcMain.handle('customers:getLedger', (_e, customerId: number, limit = 100) =>
    customersRepo.getLedger(customerId, limit)
  )
}
