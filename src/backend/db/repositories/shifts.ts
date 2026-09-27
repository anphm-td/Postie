// ============================================================================
//  Postie POS - Shifts repository (cash drawer sessions)
// ----------------------------------------------------------------------------
//  P0.4 — Kết ca đầy đủ (docs/kiotviet-roadmap.md §5, §6.2):
//    * Thu/chi tiền mặt trong ca ghi vào shift_cash_events (type 0 = thu,
//      1 = chi; bảng có trong schema.sql §2.17).
//    * Khi kết ca: expected_cash = opening_cash + cash_sales (đơn 1/3/4)
//      + SUM(thu) − SUM(chi). Hoàn tiền mặt trả hàng do returns.createReturn
//      tự ghi vào shift_cash_events (type=1) trên ca ĐANG MỞ nơi tiền rời khỏi
//      két — kể cả khi đơn thuộc ca khác/đã đóng.
//  shifts có CHECK ràng buộc đối ca (schema.sql §2.8) — close() luôn set đủ
//  closed_at/expected_cash/counted_cash/difference nên CHECK không bao giờ vỡ.
// ============================================================================

import { getDb, prepare } from '../connection.js'
import type {
  Shift,
  ShiftCashEvent,
  CreateShiftCashEventInput,
  ShiftStatus
} from '@shared/types'

/** Shift kèm tên thu ngân (JOIN users) cho màn Lịch sử ca. */
export interface ShiftWithUser extends Shift {
  user_name: string | null
  username: string | null
}

export interface ShiftListOptions {
  /** Lọc theo ca của một user cụ thể (unix seconds cho from/to). */
  userId?: number
  from?: number            // opened_at >= from (inclusive)
  to?: number              // opened_at <= to (inclusive)
  status?: ShiftStatus
  limit?: number           // default 100, tối đa 500
}

/** Open a new shift for a cashier. Returns the created shift. */
export function open(userId: number, openingCash: number): Shift {
  // Prevent a user from opening a second concurrent shift
  const existing = getActive(userId)
  if (existing) {
    throw new Error(`User ${userId} already has an open shift (#${existing.id})`)
  }
  const info = prepare(`
    INSERT INTO shifts (user_id, opening_cash, status)
    VALUES (?, ?, 0)
  `).run(userId, openingCash)
  return prepare(`SELECT * FROM shifts WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as Shift
}

/**
 * Close a shift. Computes:
 *   expected_cash = opening_cash + cash sales (order_payments CASH, đơn
 *                   status 1/3/4 — đơn trả đủ vẫn tính vì tiền bán đã vào két)
 *                   + SUM(shift_cash_events thu) − SUM(shift_cash_events chi)
 *                   (gồm dòng "Hoàn tiền trả hàng" do returns.createReturn ghi)
 *   difference    = counted_cash - expected_cash
 */
export function close(shiftId: number, countedCash: number): Shift {
  const db = getDb()
  const tx = db.transaction(() => {
    const shift = prepare(`SELECT * FROM shifts WHERE id = ?`).get(shiftId) as Shift | undefined
    if (!shift) throw new Error(`Shift ${shiftId} not found`)
    if (shift.status !== 0) throw new Error(`Shift ${shiftId} is not open`)

    // Sum cash payments on orders linked to this shift. Bao gồm đơn ĐÃ TRẢ ĐỦ
    // (status 3): tiền bán đã vào két này; phần hoàn lại đi ra qua
    // shift_cash_events (returns.createReturn tự ghi trên ca đang xử lý trả
    // hàng) — cộng trừ từng phía nên khớp két và đúng cả khi trả hàng diễn ra
    // ở ca khác. Đơn hủy (2) loại vì tiền hoàn lại tại quầy ngoài hệ thống.
    const cashRow = prepare(`
      SELECT COALESCE(SUM(op.amount), 0) AS cash
        FROM order_payments op
        JOIN payment_methods pm ON pm.id = op.payment_method_id
        JOIN orders o ON o.id = op.order_id
       WHERE o.shift_id = ? AND pm.code = 'CASH' AND o.status IN (1, 3, 4)
    `).get(shiftId) as { cash: number }

    // Thu/chi tiền mặt trong ca (P0.4): cộng/trừ trực tiếp vào két dự kiến —
    // gồm cả dòng "Hoàn tiền trả hàng" (type=1) do returns.createReturn ghi.
    const eventsRow = prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 0 THEN amount ELSE 0 END), 0) AS cash_in,
        COALESCE(SUM(CASE WHEN type = 1 THEN amount ELSE 0 END), 0) AS cash_out
        FROM shift_cash_events
       WHERE shift_id = ?
    `).get(shiftId) as { cash_in: number; cash_out: number }

    const expectedCash =
      shift.opening_cash + cashRow.cash + eventsRow.cash_in - eventsRow.cash_out
    const difference = countedCash - expectedCash

    prepare(`
      UPDATE shifts
         SET closed_at = unixepoch(),
             expected_cash = ?,
             counted_cash = ?,
             difference = ?,
             status = 1
       WHERE id = ?
    `).run(expectedCash, countedCash, difference, shiftId)
  })
  tx()
  return prepare(`SELECT * FROM shifts WHERE id = ?`).get(shiftId) as Shift
}

/** Get the currently-open shift for a user (if any). */
export function getActive(userId: number): Shift | undefined {
  return prepare(
    `SELECT * FROM shifts WHERE user_id = ? AND status = 0 ORDER BY id DESC LIMIT 1`
  ).get(userId) as Shift | undefined
}

/** Get a shift by id. */
export function getById(id: number): Shift | undefined {
  return prepare(`SELECT * FROM shifts WHERE id = ?`).get(id) as Shift | undefined
}

// ----------------------------------------------------------------------------
// Lịch sử ca (P0.4): list theo user / khoảng thời gian / trạng thái
// ----------------------------------------------------------------------------

/** List ca kèm tên thu ngân, mới nhất trước — nguồn cho màn Lịch sử ca. */
export function list(opts: ShiftListOptions = {}): ShiftWithUser[] {
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100))
  const conds: string[] = []
  const params: unknown[] = []
  if (opts.userId != null) { conds.push('s.user_id = ?'); params.push(opts.userId) }
  if (opts.from != null) { conds.push('s.opened_at >= ?'); params.push(opts.from) }
  if (opts.to != null) { conds.push('s.opened_at <= ?'); params.push(opts.to) }
  if (opts.status != null) { conds.push('s.status = ?'); params.push(opts.status) }
  const clause = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  return prepare(`
    SELECT s.*, u.display_name AS user_name, u.username AS username
      FROM shifts s
      LEFT JOIN users u ON u.id = s.user_id
      ${clause}
     ORDER BY s.opened_at DESC, s.id DESC
     LIMIT ?
  `).all(...params, limit) as ShiftWithUser[]
}

/** Lịch sử ca của MỘT nhân viên (IPC shifts:listByUser). */
export function listByUser(userId: number, opts: Omit<ShiftListOptions, 'userId'> = {}): ShiftWithUser[] {
  return list({ ...opts, userId })
}

// ----------------------------------------------------------------------------
// Thu/chi tiền mặt trong ca (shift_cash_events, P0.4)
// ----------------------------------------------------------------------------

/**
 * Ghi một lần thu (type 0) hoặc chi (type 1) tiền mặt trong ca. Chỉ cho phép
 * ghi trên ca ĐANG MỞ — sau khi kết ca, số liệu đối ca đã chốt (CHECK
 * expected/counted/difference NOT NULL) và không được thay đổi nữa.
 * amount là INTEGER cents > 0. Trả về dòng vừa ghi.
 */
export function addCashEvent(input: CreateShiftCashEventInput): ShiftCashEvent {
  const { shift_id: shiftId, type, amount } = input
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Số tiền thu/chi phải là số nguyên dương (cents).')
  }
  if (type !== 0 && type !== 1) {
    throw new Error('Loại thu/chi không hợp lệ (0 = thu, 1 = chi).')
  }
  const db = getDb()
  let eventId = 0
  db.transaction(() => {
    const shift = prepare(`SELECT status FROM shifts WHERE id = ?`).get(shiftId) as
      | { status: number }
      | undefined
    if (!shift) throw new Error(`Không tìm thấy ca #${shiftId}.`)
    if (shift.status !== 0) {
      throw new Error(`Ca #${shiftId} đã kết thúc — không thể ghi thêm thu/chi.`)
    }
    const info = prepare(`
      INSERT INTO shift_cash_events (shift_id, type, amount, note, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(shiftId, type, amount, input.note?.trim() || null, input.created_by ?? null)
    eventId = Number(info.lastInsertRowid)
  })()
  return prepare(`SELECT * FROM shift_cash_events WHERE id = ?`).get(eventId) as ShiftCashEvent
}

/** Danh sách thu/chi của một ca (mới nhất trước) — hiện kèm khi kết ca/lịch sử ca. */
export function listCashEvents(shiftId: number, limit = 200): ShiftCashEvent[] {
  return prepare(`
    SELECT * FROM shift_cash_events WHERE shift_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?
  `).all(shiftId, limit) as ShiftCashEvent[]
}

/** Tổng thu/chi ròng của một ca (dùng để hiển thị trước khi đối ca). */
export function getCashEventTotals(shiftId: number): { cash_in: number; cash_out: number; net: number } {
  const row = prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 0 THEN amount ELSE 0 END), 0) AS cash_in,
      COALESCE(SUM(CASE WHEN type = 1 THEN amount ELSE 0 END), 0) AS cash_out
      FROM shift_cash_events
     WHERE shift_id = ?
  `).get(shiftId) as { cash_in: number; cash_out: number }
  return { cash_in: row.cash_in, cash_out: row.cash_out, net: row.cash_in - row.cash_out }
}
