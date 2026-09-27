import { ipcMain } from 'electron'
import * as shiftsRepo from '../db/repositories/shifts.js'
import type { Shift, CreateShiftCashEventInput } from '@shared/types'
import type { ShiftListOptions } from '../db/repositories/shifts.js'

export function registerShiftsIpc(): void {
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

  ipcMain.handle('shifts:list', (_e, opts: ShiftListOptions = {}) =>
    shiftsRepo.list(opts)
  )
  ipcMain.handle('shifts:listByUser', (_e, userId: number, opts: Omit<ShiftListOptions, 'userId'> = {}) =>
    shiftsRepo.listByUser(userId, opts)
  )

  ipcMain.handle('shifts:addCashEvent', (_e, input: CreateShiftCashEventInput) =>
    shiftsRepo.addCashEvent(input)
  )
  ipcMain.handle('shifts:listCashEvents', (_e, shiftId: number, limit = 200) =>
    shiftsRepo.listCashEvents(shiftId, limit)
  )
  ipcMain.handle('shifts:getCashEventTotals', (_e, shiftId: number) =>
    shiftsRepo.getCashEventTotals(shiftId)
  )
}
