// ============================================================================
//  Postie POS - Shifts repository (cash drawer sessions)
// ============================================================================

import { getDb } from '../connection.js'
import type { Shift } from '../../../src/shared/types.js'

/** Open a new shift for a cashier. Returns the created shift. */
export function open(userId: number, openingCash: number): Shift {
  const db = getDb()
  // Prevent a user from opening a second concurrent shift
  const existing = getActive(userId)
  if (existing) {
    throw new Error(`User ${userId} already has an open shift (#${existing.id})`)
  }
  const info = db.prepare(`
    INSERT INTO shifts (user_id, opening_cash, status)
    VALUES (?, ?, 0)
  `).run(userId, openingCash)
  return db.prepare(`SELECT * FROM shifts WHERE id = ?`)
    .get(Number(info.lastInsertRowid)) as Shift
}

/**
 * Close a shift. Computes expected_cash = opening_cash + cash sales,
 * difference = counted_cash - expected_cash.
 */
export function close(shiftId: number, countedCash: number): Shift {
  const db = getDb()
  const tx = db.transaction(() => {
    const shift = db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(shiftId) as Shift | undefined
    if (!shift) throw new Error(`Shift ${shiftId} not found`)
    if (shift.status !== 0) throw new Error(`Shift ${shiftId} is not open`)

    // Sum cash payments on orders linked to this shift
    const cashRow = db.prepare(`
      SELECT COALESCE(SUM(op.amount), 0) AS cash
        FROM order_payments op
        JOIN payment_methods pm ON pm.id = op.payment_method_id
        JOIN orders o ON o.id = op.order_id
       WHERE o.shift_id = ? AND pm.code = 'CASH' AND o.status IN (1, 4)
    `).get(shiftId) as { cash: number }

    const expectedCash = shift.opening_cash + cashRow.cash
    const difference = countedCash - expectedCash

    db.prepare(`
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
  return db.prepare(`SELECT * FROM shifts WHERE id = ?`).get(shiftId) as Shift
}

/** Get the currently-open shift for a user (if any). */
export function getActive(userId: number): Shift | undefined {
  return getDb().prepare(
    `SELECT * FROM shifts WHERE user_id = ? AND status = 0 ORDER BY id DESC LIMIT 1`
  ).get(userId) as Shift | undefined
}

/** Get a shift by id. */
export function getById(id: number): Shift | undefined {
  return getDb().prepare(`SELECT * FROM shifts WHERE id = ?`).get(id) as Shift | undefined
}
