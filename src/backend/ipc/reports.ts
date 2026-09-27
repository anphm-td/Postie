import { ipcMain } from 'electron'
import * as reportsRepo from '../db/repositories/reports.js'
import type {
  ProductReportOptions,
  ReportRange,
  StockReportOptions
} from '../db/repositories/reports.js'

export function registerReportsIpc(): void {
  ipcMain.handle('reports:getSalesSummary', (_e, range: ReportRange = {}) =>
    reportsRepo.getSalesSummary(range)
  )
  ipcMain.handle('reports:revenueByDay', (_e, range: ReportRange = {}) =>
    reportsRepo.revenueByDay(range)
  )
  ipcMain.handle('reports:revenueByShift', (_e, range: ReportRange = {}) =>
    reportsRepo.revenueByShift(range)
  )
  ipcMain.handle('reports:revenueByUser', (_e, range: ReportRange = {}) =>
    reportsRepo.revenueByUser(range)
  )
  ipcMain.handle('reports:revenueByProduct', (_e, opts: ProductReportOptions = {}) =>
    reportsRepo.revenueByProduct(opts)
  )
  ipcMain.handle('reports:topProducts', (_e, opts: ProductReportOptions = {}) =>
    reportsRepo.topProducts(opts)
  )
  ipcMain.handle('reports:revenueByCategory', (_e, range: ReportRange = {}) =>
    reportsRepo.revenueByCategory(range)
  )
  ipcMain.handle('reports:revenueByPaymentMethod', (_e, range: ReportRange = {}) =>
    reportsRepo.revenueByPaymentMethod(range)
  )
  ipcMain.handle('reports:stockReport', (_e, opts: StockReportOptions = {}) =>
    reportsRepo.stockReport(opts)
  )
}
