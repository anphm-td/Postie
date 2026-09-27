import { ipcMain } from 'electron'
import * as productsRepo from '../db/repositories/products.js'
import * as importExcel from '../services/excel.js'
import type {
  CreateProductInput,
  UpdateProductInput,
  StockMovementType,
  ListProductsOptions,
  Product,
  ImportRowPreview
} from '@shared/types'

export function registerProductsIpc(): void {
  ipcMain.handle('products:list', (_e, opts: ListProductsOptions = {}) =>
    productsRepo.list(opts)
  )
  ipcMain.handle('products:getById', (_e, id: number) =>
    productsRepo.getById(id)
  )
  ipcMain.handle('products:getByBarcode', (_e, barcode: string) =>
    productsRepo.getByBarcode(barcode)
  )
  ipcMain.handle('products:create', (_e, input: CreateProductInput) =>
    productsRepo.create(input)
  )
  ipcMain.handle('products:update', (_e, id: number, input: UpdateProductInput) =>
    productsRepo.update(id, input)
  )
  ipcMain.handle('products:deactivate', (_e, id: number) =>
    productsRepo.deactivate(id)
  )
  ipcMain.handle('products:adjustStock', (_e, params: {
    productId: number
    delta: number
    type: StockMovementType
    note?: string | null
    userId: number
  }): Product => {
    productsRepo.adjustStock({
      productId: params.productId,
      delta: params.delta,
      type: params.type,
      note: params.note,
      userId: params.userId
    })
    return productsRepo.getById(params.productId) as Product
  })

  // Điều chỉnh tồn thủ công (type=3, delta signed, bắt buộc lý do).
  ipcMain.handle('products:manualAdjust', (_e, params: {
    productId: number
    delta: number
    userId: number
    note: string
  }) => productsRepo.manualAdjust(params))

  // Hao hụt / hàng hỏng (type=4, delta âm).
  ipcMain.handle('products:wastage', (_e, params: {
    productId: number
    qty: number
    userId: number
    note?: string | null
  }) => productsRepo.wastage(params))

  // Thẻ kho: toàn bộ lịch sử tồn của 1 SP (join user_name, invoice_no).
  ipcMain.handle('products:listMovements', (_e, productId: number, limit = 200) =>
    productsRepo.listMovements(productId, limit)
  )
  ipcMain.handle('products:listLowStock', () => productsRepo.listLowStock())
  ipcMain.handle('products:getStockReport', () => productsRepo.getStockReport())

  // Excel import: chọn file + preview, sinh file mẫu, commit theo lô.
  ipcMain.handle('products:importPick', () => importExcel.pickAndParseFile())
  ipcMain.handle('products:importTemplate', () => importExcel.saveTemplateFile())
  ipcMain.handle('products:importCommit', (_e, rows: ImportRowPreview[], userId: number) =>
    importExcel.commitImportRows(rows, userId)
  )
}
