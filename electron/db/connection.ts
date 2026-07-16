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
import type { Database as DB } from 'better-sqlite3'

let _db: DB | null = null

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
