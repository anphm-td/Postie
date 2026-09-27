import { ipcMain } from 'electron'
import * as promotionsRepo from '../db/repositories/promotions.js'
import type {
  EvaluateCartParams,
  ListPromotionsOptions,
  ListVouchersOptions
} from '../db/repositories/promotions.js'
import type { CreatePromotionInput, CreateVoucherInput } from '@shared/types'

export function registerPromotionsIpc(): void {
  ipcMain.handle('promotions:list', (_e, opts: ListPromotionsOptions = {}) =>
    promotionsRepo.listPromotions(opts)
  )
  ipcMain.handle('promotions:getById', (_e, id: number) =>
    promotionsRepo.getPromotionById(id)
  )
  ipcMain.handle('promotions:create', (_e, input: CreatePromotionInput) =>
    promotionsRepo.createPromotion(input)
  )
  ipcMain.handle('promotions:update', (_e, id: number, input: Partial<CreatePromotionInput> & { is_active?: number }) =>
    promotionsRepo.updatePromotion(id, input)
  )
  ipcMain.handle('promotions:deactivate', (_e, id: number) =>
    promotionsRepo.deactivatePromotion(id)
  )
  ipcMain.handle('promotions:resolveCartDiscounts', (_e, params: EvaluateCartParams) =>
    promotionsRepo.resolveCartDiscounts(params)
  )
  ipcMain.handle('promotions:previewCartDiscounts', (_e, params: EvaluateCartParams & { voucher_code?: string }) =>
    promotionsRepo.previewCartDiscounts(params)
  )

  ipcMain.handle('vouchers:list', (_e, opts: ListVouchersOptions = {}) =>
    promotionsRepo.listVouchers(opts)
  )
  ipcMain.handle('vouchers:getById', (_e, id: number) =>
    promotionsRepo.getVoucherById(id)
  )
  ipcMain.handle('vouchers:create', (_e, input: CreateVoucherInput) =>
    promotionsRepo.createVoucher(input)
  )
  ipcMain.handle('vouchers:deactivate', (_e, id: number) =>
    promotionsRepo.deactivateVoucher(id)
  )
  ipcMain.handle('vouchers:findForRedemption', (_e, code: string, opts?: { now?: number; allowUsedByOrderId?: number }) =>
    promotionsRepo.findVoucherForRedemption(code, opts)
  )
  ipcMain.handle('vouchers:redeem', (_e, voucherId: number, orderId: number, allowUsedByOrderId?: number) =>
    promotionsRepo.redeemVoucher(voucherId, orderId, allowUsedByOrderId)
  )
  ipcMain.handle('vouchers:release', (_e, orderId: number) =>
    promotionsRepo.releaseVoucher(orderId)
  )
}
