// ============================================================================
//  Postie POS - Stocktakes repository (kiểm kho — P1.3)
// ----------------------------------------------------------------------------
//  Phiếu kiểm đối chiếu tồn số sách với tồn thực tế (db/schema.sql:382-407):
//    * status 0 = đang kiểm  --complete()-->  1 = hoàn thành
//         |--cancel()--> 2 = đã hủy (hủy phiếu dùng status, KHÔNG DELETE)
//  * Trong lúc phiếu mở, KHÔNG gì đụng tới tồn kho. Mỗi dòng chốt book_qty =
//    products.stock TẠI THỜI ĐIỂM thêm dòng; quét lại mã chỉ UPSERT counted_qty.
//  * "Hoàn thành" chạy trong MỘT transaction: với mỗi dòng có chênh lệch,
//    INSERT stock_movements type=3 với delta = counted − book (CHO PHÉP âm khi
//    thiếu hàng) — trigger trg_stock_after_insert tự cộng products.stock,
//    không UPDATE stock trực tiếp. Guard tồn âm trong products.adjustStock
//    chặn trường hợp trong lúc kiểm có bán hàng làm tồn thực xuống dưới số
//    đếm — khi đó cả phiếu bị rollback, người dùng phải kiểm tra lại.
//
//  LƯU Ý quy trình: book_qty là snapshot lúc thêm dòng nên nên hoàn thành
//  phiếu sớm sau khi đếm; bán hàng trong lúc kiểm sẽ làm lệch chênh lệch.
// ============================================================================

import { getDb, prepare } from '../connection.js'
import * as productsRepo from './products.js'
import type {
  CompleteStocktakeInput,
  CreateStocktakeInput,
  Stocktake,
  StocktakeDetailInput,
  StocktakeDetailRow,
  StocktakeStatus
} from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ (chưa có trong src/shared/types.ts — đã ghi vào missingTypes)
// ----------------------------------------------------------------------------

export interface ListStocktakesOptions {
  status?: StocktakeStatus
  limit?: number
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Mở phiếu kiểm mới (status 0). Có thể kèm các dòng đầu tiên; mỗi dòng tự
 * chốt book_qty = products.stock hiện tại (trừ khi caller truyền book_qty).
 */
export function open(userId: number, input: CreateStocktakeInput = {}): Stocktake {
  if (!Number.isInteger(userId)) throw new Error('Thiếu thông tin người mở phiếu (userId).')
  const db = getDb()
  const tx = db.transaction(() => {
    const info = prepare(
      `INSERT INTO stocktakes (status, note, created_by) VALUES (0, ?, ?)`
    ).run(input.note ?? null, userId)
    const stocktakeId = Number(info.lastInsertRowid)
    for (const d of input.details ?? []) {
      upsertLine(stocktakeId, d)
    }
    return getById(stocktakeId) as Stocktake
  })
  return tx()
}

/**
 * Thêm/cập nhật một dòng đếm (quét mã liên tục: quét lại = upsert số đếm).
 * book_qty giữ nguyên giá trị chốt LẦN ĐẦU để chênh lệch có mốc so sánh cố định.
 */
export function addLine(stocktakeId: number, input: StocktakeDetailInput): StocktakeDetailRow {
  assertOpen(stocktakeId)
  return upsertLine(stocktakeId, input)
}

/** Bỏ một dòng khỏi phiếu đang kiểm (chưa phát sinh movement nào nên xóa được). */
export function removeLine(stocktakeId: number, detailId: number): void {
  assertOpen(stocktakeId)
  const res = prepare(
    `DELETE FROM stocktake_details WHERE id = ? AND stocktake_id = ?`
  ).run(detailId, stocktakeId)
  if (res.changes === 0) throw new Error('Không tìm thấy dòng kiểm cần xóa.')
}

/** Phiếu + các dòng (join tên/barcode sản phẩm, tính sẵn diff_qty). */
export function getById(id: number): Stocktake | undefined {
  const st = prepare(`SELECT * FROM stocktakes WHERE id = ?`).get(id) as Stocktake | undefined
  if (!st) return undefined
  st.details = prepare(`
    SELECT d.*, p.name AS product_name, p.barcode AS barcode
      FROM stocktake_details d
      JOIN products p ON p.id = d.product_id
     WHERE d.stocktake_id = ?
     ORDER BY d.id
  `).all(id) as StocktakeDetailRow[]
  for (const d of st.details) {
    d.diff_qty = d.counted_qty - d.book_qty
  }
  return st
}

/** List phiếu kiểm (mới nhất trước), lọc theo trạng thái. */
export function list(opts: ListStocktakesOptions = {}): Stocktake[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.status != null) { where.push('status = ?'); params.push(opts.status) }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100))
  return prepare(
    `SELECT * FROM stocktakes ${clause} ORDER BY created_at DESC, id DESC LIMIT ?`
  ).all(...params, limit) as Stocktake[]
}

/**
 * "Hoàn thành" — cân bằng kho về số thực tế: 1 transaction sinh stock_movements
 * type=3 cho TỪNG dòng có chênh lệch (delta = counted − book, cho phép âm).
 * `overrides` cho phép ghi đè số đếm cuối trước khi chốt. Phiếu rỗng -> lỗi.
 */
export function complete(input: CompleteStocktakeInput): Stocktake {
  const db = getDb()
  const tx = db.transaction(() => {
    const st = prepare(`SELECT * FROM stocktakes WHERE id = ?`)
      .get(input.stocktake_id) as Stocktake | undefined
    if (!st) throw new Error('Không tìm thấy phiếu kiểm kho.')
    if (st.status !== 0) throw new Error('Phiếu kiểm đã hoàn thành hoặc đã hủy — không thể hoàn thành lại.')
    const createdBy = input.created_by ?? st.created_by

    for (const o of input.overrides ?? []) {
      if (!Number.isInteger(o.counted_qty) || o.counted_qty < 0) {
        throw new Error('Số đếm thực tế phải là số nguyên không âm.')
      }
      const res = prepare(
        `UPDATE stocktake_details SET counted_qty = ? WHERE stocktake_id = ? AND product_id = ?`
      ).run(o.counted_qty, input.stocktake_id, o.product_id)
      if (res.changes === 0) {
        throw new Error(`Phiếu kiểm không có dòng cho sản phẩm #${o.product_id}.`)
      }
    }

    const details = prepare(
      `SELECT * FROM stocktake_details WHERE stocktake_id = ?`
    ).all(input.stocktake_id) as StocktakeDetailRow[]
    if (details.length === 0) throw new Error('Phiếu kiểm không có dòng nào để hoàn thành.')

    for (const d of details) {
      const delta = d.counted_qty - d.book_qty
      if (delta === 0) continue // đếm đúng số sách — không phát sinh movement
      productsRepo.adjustStock({
        productId: d.product_id,
        delta,                    // có thể ÂM (thiếu hàng) — guard tồn âm vẫn chặn stock < 0
        type: 3,                  // adjust (kiểm kho)
        note: `Kiểm kho #${st.id}`,
        userId: createdBy
      })
    }

    prepare(`UPDATE stocktakes SET status = 1 WHERE id = ?`).run(st.id)
    return getById(st.id) as Stocktake
  })
  return tx()
}

/**
 * Hủy phiếu đang kiểm (0 -> 2). Không hoàn thành được phiếu đã hủy/hoàn thành;
 * phiếu ĐÃ hoàn thành không hủy được vì movements type=3 đã áp vào kho — muốn
 * hoàn tác phải lập phiếu kiểm ngược lại.
 */
export function cancel(id: number): Stocktake {
  const db = getDb()
  const tx = db.transaction(() => {
    const st = prepare(`SELECT * FROM stocktakes WHERE id = ?`).get(id) as Stocktake | undefined
    if (!st) throw new Error('Không tìm thấy phiếu kiểm kho.')
    if (st.status !== 0) throw new Error('Chỉ hủy được phiếu đang kiểm (status = 0).')
    prepare(`UPDATE stocktakes SET status = 2 WHERE id = ?`).run(id)
    return getById(id) as Stocktake
  })
  return tx()
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function assertOpen(stocktakeId: number): Stocktake {
  const st = prepare(`SELECT * FROM stocktakes WHERE id = ?`).get(stocktakeId) as Stocktake | undefined
  if (!st) throw new Error('Không tìm thấy phiếu kiểm kho.')
  if (st.status !== 0) throw new Error('Phiếu kiểm đã khóa (hoàn thành/đã hủy) — không thể sửa dòng.')
  return st
}

/** INSERT mới hoặc UPSERT counted_qty khi mặt hàng đã có trong phiếu. */
function upsertLine(stocktakeId: number, input: StocktakeDetailInput): StocktakeDetailRow {
  if (!Number.isInteger(input.counted_qty) || input.counted_qty < 0) {
    throw new Error('Số đếm thực tế phải là số nguyên không âm.')
  }
  const product = productsRepo.getById(input.product_id)
  if (!product) throw new Error(`Không tìm thấy sản phẩm #${input.product_id}.`)
  const book = input.book_qty ?? product.stock // chốt tồn số sách tại thời điểm thêm dòng
  if (!Number.isInteger(book) || book < 0) {
    throw new Error('Tồn số sách phải là số nguyên không âm.')
  }
  prepare(`
    INSERT INTO stocktake_details (stocktake_id, product_id, book_qty, counted_qty)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (stocktake_id, product_id)
    DO UPDATE SET counted_qty = excluded.counted_qty
  `).run(stocktakeId, input.product_id, book, input.counted_qty)
  return prepare(
    `SELECT * FROM stocktake_details WHERE stocktake_id = ? AND product_id = ?`
  ).get(stocktakeId, input.product_id) as StocktakeDetailRow
}
