// ============================================================================
//  Postie POS - Database connection (singleton)
// ----------------------------------------------------------------------------
//  Opens the SQLite database once and shares the handle across the main
//  process. PRAGMAs are re-applied at runtime (the schema sets them too, but
//  foreign_keys / busy_timeout are per-connection and must be reasserted).
//
//  First-run setup: previously the DB was created out-of-band via
//  `electron . --init-db` (a CLI-only flow using readline, which cannot work
//  once the app is double-clicked as a packaged .exe — there is no terminal
//  attached to read a password from). initializeDatabase() below replaces
//  that: it is called from a renderer-facing IPC handler (db:initialize),
//  driven by a normal React form (see FirstRunSetup screen), so the store
//  owner sets the admin password through the app UI on first launch.
// ============================================================================

import { app } from 'electron'
import { resolve, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import type { Database as DB, Statement } from 'better-sqlite3'

let _db: DB | null = null

// ----------------------------------------------------------------------------
// Prepared-statement cache
// ----------------------------------------------------------------------------
// better-sqlite3 does NOT cache prepared statements: every db.prepare() call
// re-parses the SQL. Repositories used to prepare on every invocation; now
// they import prepare() below, which caches per Database handle (WeakMap —
// closing/reopening the DB naturally starts a fresh cache and lets old
// statements be garbage-collected).
const stmtCache = new WeakMap<DB, Map<string, Statement>>()

/** Prepare `sql` once per database handle and reuse the statement afterwards. */
export function prepare(sql: string): Statement {
  const db = getDb()
  let cache = stmtCache.get(db)
  if (!cache) {
    cache = new Map()
    stmtCache.set(db, cache)
  }
  let stmt = cache.get(sql)
  if (!stmt) {
    stmt = db.prepare(sql)
    cache.set(sql, stmt)
  }
  return stmt
}

// ----------------------------------------------------------------------------
// Schema migrations
// ----------------------------------------------------------------------------
// schema.sql only runs when the DB file is created, so any schema change made
// AFTER a user already has a DB would never reach them. Each entry below is
// applied in order (guarded by PRAGMA user_version) inside a transaction the
// first time the app opens an older DB. schema.sql stays the source of truth
// for FRESH installs; migrations bring EXISTING installs up to date.
const MIGRATIONS: Array<{ version: number; description: string; up: (db: DB) => void }> = [
  {
    version: 1,
    description: 'Composite performance indexes (recent orders, customer ledger, stock history)',
    up(db) {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_orders_created_id          ON orders           (created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_customer_ledger_cust_time  ON customer_ledger  (customer_id, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_stock_movements_prod_time  ON stock_movements  (product_id, created_at DESC, id DESC);
      `)
      // Refresh planner statistics so the new indexes are actually picked up.
      db.exec('ANALYZE')
    }
  },
  {
    version: 2,
    description:
      'KiotViet feature set: promotions/vouchers, purchase orders + supplier ledger, stocktakes, ' +
      'combo/variants/batches, shift cash events, cash transactions, app settings; new columns on ' +
      'orders (held_at, e_invoice_no), order_details (variant_id, cost_cents), stock_movements ' +
      '(variant_id, batch_id), products (type), suppliers (balance, updated_at)',
    up(db) {
      // 1. Tables, indexes and triggers: replay the whole schema file additively.
      //    Every DDL statement in it is CREATE ... IF NOT EXISTS and every seed is
      //    INSERT OR IGNORE, so this is a no-op for objects that already exist.
      //    PRAGMA lines are stripped: connection-level settings are applied by
      //    getDb() anyway, and PRAGMA journal_mode cannot run inside a transaction.
      const sql = readFileSync(resolveSchemaPath(), 'utf8').replace(/^\s*PRAGMA[^\n]*$/gim, '')
      db.exec(sql)

      // 2. New columns on pre-existing tables. SQLite has no ADD COLUMN IF NOT
      //    EXISTS, so guard each one against PRAGMA table_info.
      addColumnIfMissing(db, 'orders', 'held_at', 'INTEGER')
      addColumnIfMissing(db, 'orders', 'e_invoice_no', 'TEXT')
      addColumnIfMissing(db, 'order_details', 'variant_id', 'INTEGER REFERENCES product_variants (id) ON DELETE SET NULL')
      addColumnIfMissing(db, 'order_details', 'cost_cents', 'INTEGER NOT NULL DEFAULT 0')
      addColumnIfMissing(db, 'stock_movements', 'variant_id', 'INTEGER REFERENCES product_variants (id) ON DELETE SET NULL')
      addColumnIfMissing(db, 'stock_movements', 'batch_id', 'INTEGER REFERENCES batches (id) ON DELETE SET NULL')
      addColumnIfMissing(db, 'products', 'type', 'INTEGER NOT NULL DEFAULT 0 CHECK (type IN (0, 1))')
      addColumnIfMissing(db, 'suppliers', 'balance', 'INTEGER NOT NULL DEFAULT 0')
      addColumnIfMissing(db, 'suppliers', 'updated_at', 'INTEGER NOT NULL DEFAULT (unixepoch())')

      // 3. suppliers.balance is DERIVED from supplier_ledger (trigger trg_supplier_ledger_after_insert
      //    was just created). Seed each supplier's balance from their ledger history so the
      //    derived column starts correct instead of at 0 while debts exist.
      db.exec(`
        UPDATE suppliers
           SET balance = COALESCE((SELECT SUM(l.amount) FROM supplier_ledger l WHERE l.supplier_id = suppliers.id), 0)
      `)

      // 4. Known limitation (SQLite cannot DROP NOT NULL without a table rebuild):
      //    on DBs created before this migration products.barcode keeps NOT NULL,
      //    so products without a barcode cannot be created until a rebuild migration.
    }
  }
]

/** Add `column` to `table` with the given SQL definition if it does not exist yet. */
function addColumnIfMissing(db: DB, table: string, column: string, definition: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

/**
 * Apply pending migrations based on PRAGMA user_version. Idempotent — runs on
 * every open and returns immediately when the DB is already current.
 */
export function migrate(db: DB): void {
  let version = Number(db.pragma('user_version', { simple: true }))
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue
    db.transaction(() => {
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    })()
    version = m.version
  }
}

/**
 * Resolve the DB file path. Single source of truth — every other place that
 * needs the DB path (init flows, diagnostics) must import this instead of
 * recomputing it, or the two can drift out of sync.
 *  - In production: <userData>/postie.db (per-user app data dir).
 *  - In development: ./postie.db (project root) for easy inspection.
 *  - Override with POSTIE_DB_PATH env var if needed.
 */
export function resolveDbPath(): string {
  if (process.env.POSTIE_DB_PATH) return resolve(process.env.POSTIE_DB_PATH)
  if (app?.isPackaged) return resolve(app.getPath('userData'), 'postie.db')
  return resolve(process.cwd(), 'postie.db')
}

/**
 * Resolve schema.sql. In dev it lives at db/schema.sql in the project.
 * In a packaged app it must be shipped via electron-builder's
 * `extraResources` (see package.json) and is read from process.resourcesPath.
 */
export function resolveSchemaPath(): string {
  return app?.isPackaged
    ? join(process.resourcesPath, 'schema.sql')
    : resolve(process.cwd(), 'db', 'schema.sql')
}

/**
 * True if the DB file doesn't exist yet, or exists but has no users row —
 * either way the app needs to go through first-run setup before Login.
 */
export function needsFirstRunSetup(): boolean {
  const dbPath = resolveDbPath()
  if (!existsSync(dbPath)) return true
  try {
    const db = new Database(dbPath, { readonly: true })
    const row = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
    db.close()
    return row.c === 0
  } catch {
    return true
  }
}

/**
 * Creates the DB file if missing, applies schema.sql, and seeds the admin
 * user with the given password (hashed with bcrypt). Safe to call again on
 * an existing DB — skips seeding admin if a user already exists. Caches the
 * resulting handle so getDb() works immediately afterwards.
 */
export function initializeDatabase(adminPassword: string): void {
  if (adminPassword.length < 6) {
    throw new Error('Mật khẩu admin phải có ít nhất 6 ký tự.')
  }

  const dbPath = resolveDbPath()
  const alreadyExists = existsSync(dbPath)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  if (!alreadyExists) {
    db.exec(readFileSync(resolveSchemaPath(), 'utf8'))
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
  if (userCount.c === 0) {
    const hash = bcrypt.hashSync(adminPassword, 10)
    db.prepare(
      `INSERT INTO users (username, password_hash, display_name, role, is_active)
       VALUES ('admin', ?, 'Administrator', 0, 1)`
    ).run(hash)
  }

  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -20000')
  migrate(db)

  _db = db
}

/**
 * Open (or return the cached) database handle.
 * Throws if the DB file does not exist yet — the renderer should check
 * needsFirstRunSetup() (via db:needsSetup) and route to FirstRunSetup before
 * anything calls into repositories.
 */
export function getDb(): DB {
  if (_db) return _db

  const dbPath = resolveDbPath()
  if (!existsSync(dbPath)) {
    throw new Error(
      `Database file not found at ${dbPath}. Ứng dụng cần chạy qua màn hình thiết lập lần đầu trước.`
    )
  }

  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -20000')

  // Bring an older DB up to date (no-op when already current).
  migrate(db)

  _db = db
  return db
}

/** Close the cached handle (called on app quit). */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

/** For tests / init flow: allow injecting a pre-opened handle. */
export function setDb(db: DB | null): void {
  _db = db
}
