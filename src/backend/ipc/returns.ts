import { ipcMain } from 'electron'
import * as returnsRepo from '../db/repositories/returns.js'
import type { CreateReturnInput } from '../db/repositories/returns.js'

export function registerReturnsIpc(): void {
  ipcMain.handle('returns:createReturn', (_e, input: CreateReturnInput) =>
    returnsRepo.createReturn(input)
  )
  ipcMain.handle('returns:getById', (_e, id: number) =>
    returnsRepo.getReturnById(id)
  )
  ipcMain.handle('returns:listByOrder', (_e, orderId: number) =>
    returnsRepo.listByOrder(orderId)
  )
  ipcMain.handle('returns:listRecent', (_e, limit = 50) =>
    returnsRepo.listRecent(limit)
  )
}
