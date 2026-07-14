// ============================================================================
//  Postie POS - Payment methods repository
// ----------------------------------------------------------------------------
//  Payment methods (CASH / CARD / QR) are seeded by db/schema.sql and are
//  referenced by order_payments.payment_method_id. This repo exposes a
//  read-only list so the POS register can map a tender button (e.g. "Tiền mặt")
//  to the correct payment_method_id without hardcoding the id.
// ============================================================================

import { getDb } from '../connection.js'
import type { PaymentMethod } from '../../../src/shared/types.js'

/** List all active payment methods, ordered by id (stable seed order). */
export function list(): PaymentMethod[] {
  return getDb()
    .prepare(`SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY id`)
    .all() as PaymentMethod[]
}
