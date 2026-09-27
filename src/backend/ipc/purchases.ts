import { ipcMain } from 'electron'
import * as purchasesRepo from '../db/repositories/purchases.js'
import type {
  ListPurchaseOrdersOptions,
  ReceivePurchaseInput
} from '../db/repositories/purchases.js'
import type { CreatePurchaseOrderInput } from '@shared/types'

export function registerPurchasesIpc(): void {
  ipcMain.handle('purchases:create', (_e, input: CreatePurchaseOrderInput) =>
    purchasesRepo.create(input)
  )
  ipcMain.handle('purchases:receive', (_e, params: ReceivePurchaseInput) =>
    purchasesRepo.receive(params)
  )
  ipcMain.handle('purchases:cancel', (_e, poId: number) =>
    purchasesRepo.cancel(poId)
  )
  ipcMain.handle('purchases:getReceivedLines', (_e, poId: number) =>
    purchasesRepo.getReceivedLines(poId)
  )
  ipcMain.handle('purchases:getById', (_e, id: number) =>
    purchasesRepo.getById(id)
  )
  ipcMain.handle('purchases:list', (_e, opts: ListPurchaseOrdersOptions = {}) =>
    purchasesRepo.list(opts)
  )
}
