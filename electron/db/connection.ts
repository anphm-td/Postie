// ============================================================================
//  Postie POS - Database connection (singleton)
// ----------------------------------------------------------------------------
//  Opens the SQLite database once and shares the handle across the main
//  process. PRAGMAs are re-applied at runtime (the schema sets them too, but
//  foreign_keys / busy_timeout are per-connection and must be reasserted).
// ============================================================================

import { app } from 'electron'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { Database as DB } from 'better-sqlite3'

let _db: DB | null = null

/**
 * Resolve the DB file path.
 *  - In production: <userData>/postie.db (per-user app data dir).
 *  - In development: ./postie.db (project root) for easy inspection.
 *  - Override with POSTIE_DB_PATH env var if needed.
 */
function resolveDbPath(): string {
  if (process.env.POSTIE_DB_PATH) return resolve(process.env.POSTIE_DB_PATH)
  if (app?.isPackaged) return resolve(app.getPath('userData'), 'postie.db')
  return resolve(process.cwd(), 'postie.db')
}

/**
 * Open (or return the cached) database handle.
 * Throws if the DB file does not exist yet — the renderer must run
 * `db:init` first (via the init script or the first-run flow).
 */
export function getDb(): DB {
  if (_db) return _db

  const dbPath = resolveDbPath()
  if (!existsSync(dbPath)) {
    throw new Error(
      `Database file not found at ${dbPath}. Run "npm run db:init" first.`
    )
  }

  const db = new Database(dbPath)

  // Per-connection PRAGMAs (journal_mode is persisted in the DB header).
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('temp_store = MEMORY')
  db.pragma('cache_size = -20000')

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
