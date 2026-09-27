import { ipcMain } from 'electron'
import * as paymentMethodsRepo from '../db/repositories/payment-methods.js'

export function registerPaymentMethodsIpc(): void {
  ipcMain.handle('payment_methods:list', () => paymentMethodsRepo.list())
}
