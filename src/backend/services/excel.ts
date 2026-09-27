import { dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { prepare } from '../db/connection.js'
import * as productsRepo from '../db/repositories/products.js'
import type { ImportCommitResult, ImportPickResult, ImportRowPreview } from '@shared/types'

const MAX_ROWS = 5000

const HEADER_ALIASES: Record<'name' | 'barcode' | 'stock' | 'cost' | 'price' | 'unit', string[]> = {
  name: ['tensanpham', 'ten', 'tenhang', 'tenmathang', 'sanpham', 'ten_sp'],
  barcode: ['mavach', 'barcode', 'masovach'],
  stock: ['soluong', 'tonkho', 'soluongton', 'ton', 'soluongtonkho'],
  cost: ['giagoc', 'gianhap', 'giamua', 'cost'],
  price: ['giaban', 'gia', 'giabanle', 'price'],
  unit: ['donvi', 'donvitinh', 'unit']
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function mapHeaders(headerRow: unknown[]): {
  map: Record<keyof typeof HEADER_ALIASES, number> | null
  unmapped: string[]
} {
  const map = {} as Record<keyof typeof HEADER_ALIASES, number>
  const used = new Set<number>()
  const unmapped: string[] = []
  headerRow.forEach((cell, idx) => {
    const norm = normalizeHeader(cell)
    if (!norm) return
    let matched = false
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(norm) && map[field as keyof typeof HEADER_ALIASES] === undefined) {
        map[field as keyof typeof HEADER_ALIASES] = idx
        used.add(idx)
        matched = true
        break
      }
    }
    if (!matched) unmapped.push(String(cell))
  })
  return { map: map.name !== undefined ? map : null, unmapped }
}

function parseDongCell(value: unknown): number {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function parseStockCell(value: unknown): number {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  const n = Number(digits)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

function cleanBarcode(value: unknown): string | null {
  const s = String(value ?? '').trim()
  return s ? s : null
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim()
}

export async function pickAndParseFile(): Promise<ImportPickResult | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const picked = await dialog.showOpenDialog(win, {
    title: 'Chọn file Excel nhập hàng',
    properties: ['openFile'],
    filters: [
      { name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }
    ]
  })
  if (picked.canceled || picked.filePaths.length === 0) return null
  const filePath = picked.filePaths[0]
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath

  const workbook = XLSX.read(readFileSync(filePath), { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
  if (grid.length < 2) {
    throw new Error('File trống hoặc chỉ có hàng tiêu đề.')
  }

  const { map, unmapped } = mapHeaders(grid[0])
  if (!map) {
    throw new Error('Không tìm thấy cột "Tên sản phẩm" trong hàng tiêu đề đầu tiên.')
  }

  const existingBarcodes = new Set(
    (prepare(`SELECT barcode FROM products WHERE barcode IS NOT NULL`).all() as Array<{ barcode: string }>)
      .map((r) => r.barcode)
  )
  const seenInFile = new Set<string>()

  const rows: ImportRowPreview[] = []
  const dataRows = grid.slice(1).filter((r) => r.some((c) => cleanText(c) !== ''))
  if (dataRows.length > MAX_ROWS) {
    throw new Error(`File có ${dataRows.length} dòng — vượt giới hạn ${MAX_ROWS} dòng mỗi lần nhập.`)
  }

  dataRows.forEach((raw, i) => {
    const rowNo = i + 2
    const name = cleanText(raw[map.name])
    const barcode = map.barcode !== undefined ? cleanBarcode(raw[map.barcode]) : null
    const stock = map.stock !== undefined ? parseStockCell(raw[map.stock]) : 0
    const cost = map.cost !== undefined ? parseDongCell(raw[map.cost]) * 100 : 0
    const price = map.price !== undefined ? parseDongCell(raw[map.price]) * 100 : 0
    const unit = map.unit !== undefined ? cleanText(raw[map.unit]) || null : null

    const base = { row: rowNo, name, barcode, stock, cost, price, unit }

    if (!name) {
      rows.push({ ...base, status: 'error', error: 'Thiếu tên sản phẩm' })
      return
    }
    if (price <= 0) {
      rows.push({ ...base, status: 'error', error: 'Giá bán phải lớn hơn 0' })
      return
    }
    if (barcode && seenInFile.has(barcode)) {
      rows.push({ ...base, status: 'error', error: 'Mã vạch bị lặp lại trong file' })
      return
    }
    if (barcode) seenInFile.add(barcode)

    rows.push({
      ...base,
      status: barcode && existingBarcodes.has(barcode) ? 'update' : 'new'
    })
  })

  return { fileName, rows, unmappedHeaders: unmapped }
}

export async function saveTemplateFile(): Promise<string | null> {
  const win = BrowserWindow.getAllWindows()[0]
  const picked = await dialog.showSaveDialog(win, {
    title: 'Lưu file mẫu nhập hàng',
    defaultPath: 'postie-nhap-hang-mau.xlsx',
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (picked.canceled || !picked.filePath) return null

  const aoa = [
    ['Tên sản phẩm', 'Mã vạch', 'Số lượng', 'Giá gốc', 'Giá bán', 'Đơn vị'],
    ['Cà phê đen', '8934563102113', 50, 12000, 20000, 'ly'],
    ['Nước suối 500ml', '', 120, 4500, 10000, 'chai']
  ]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Nhap hang')
  XLSX.writeFile(workbook, picked.filePath)
  return picked.filePath
}

export function commitImportRows(
  rows: ImportRowPreview[],
  userId: number
): ImportCommitResult {
  const result: ImportCommitResult = { imported: 0, updated: 0, failed: [] }
  for (const row of rows) {
    try {
      if (!row.name.trim()) throw new Error('Thiếu tên sản phẩm')
      if (row.price <= 0) throw new Error('Giá bán phải lớn hơn 0')

      const existing = row.barcode ? productsRepo.getByBarcode(row.barcode) : undefined
      if (existing) {
        productsRepo.update(existing.id, {
          name: row.name.trim(),
          cost: row.cost,
          price: row.price,
          unit: row.unit
        })
        const delta = row.stock - existing.stock
        if (delta !== 0) {
          productsRepo.manualAdjust({
            productId: existing.id,
            delta,
            userId,
            note: 'Nhập từ Excel'
          })
        }
        result.updated++
      } else {
        productsRepo.create({
          name: row.name.trim(),
          barcode: row.barcode,
          stock: row.stock,
          cost: row.cost,
          price: row.price,
          unit: row.unit,
          created_by: userId
        })
        result.imported++
      }
    } catch (err) {
      result.failed.push({
        row: row.row,
        name: row.name,
        reason: err instanceof Error ? err.message : 'Lỗi không xác định'
      })
    }
  }
  return result
}
