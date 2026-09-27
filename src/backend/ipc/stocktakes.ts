import { ipcMain } from 'electron'
import * as stocktakesRepo from '../db/repositories/stocktakes.js'
import type { ListStocktakesOptions } from '../db/repositories/stocktakes.js'
import type {
  CreateStocktakeInput,
  StocktakeDetailInput,
  CompleteStocktakeInput
} from '@shared/types'

export function registerStocktakesIpc(): void {
  ipcMain.handle('stocktakes:open', (_e, userId: number, input: CreateStocktakeInput = {}) =>
    stocktakesRepo.open(userId, input)
  )
  ipcMain.handle('stocktakes:addLine', (_e, stocktakeId: number, input: StocktakeDetailInput) =>
    stocktakesRepo.addLine(stocktakeId, input)
  )
  ipcMain.handle('stocktakes:removeLine', (_e, stocktakeId: number, detailId: number) =>
    stocktakesRepo.removeLine(stocktakeId, detailId)
  )
  ipcMain.handle('stocktakes:getById', (_e, id: number) =>
    stocktakesRepo.getById(id)
  )
  ipcMain.handle('stocktakes:list', (_e, opts: ListStocktakesOptions = {}) =>
    stocktakesRepo.list(opts)
  )
  ipcMain.handle('stocktakes:complete', (_e, input: CompleteStocktakeInput) =>
    stocktakesRepo.complete(input)
  )
  ipcMain.handle('stocktakes:cancel', (_e, id: number) =>
    stocktakesRepo.cancel(id)
  )
}
