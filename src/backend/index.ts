// ============================================================================
//  Postie POS - Electron main process entry
// ----------------------------------------------------------------------------
//  Creates the BrowserWindow, registers IPC, and opens the DB. The renderer
//  (React) is loaded from the Vite dev server in development, or from the
//  built file in production.
//
//  Normal launch (no special argv): always registers IPC and opens the
//  window, whether or not the DB exists yet. The renderer checks
//  `db:needsSetup` and shows FirstRunSetup if the DB hasn't been created —
//  this is what makes a freshly downloaded .exe work with no manual step.
//
//  `electron . --init-db [--fresh] [--password <pw>]` remains as a dev-only
//  CLI shortcut, now using the *same* path resolution as the normal app
//  (imported from connection.ts) so the two can never drift apart again.
// ============================================================================

import { app, BrowserWindow, shell } from 'electron'
import { join, resolve } from 'node:path'
import { registerIpc } from './ipc/index.js'
import { closeDb, getDb, resolveDbPath, resolveSchemaPath } from './db/connection.js'

async function runInitDbMode(): Promise<void> {
  const argv = process.argv.slice(process.argv.indexOf('--init-db') + 1)
  const fresh = argv.includes('--fresh')
  let password: string | null = null
  const pwIdx = argv.indexOf('--password')
  if (pwIdx !== -1) password = argv[pwIdx + 1] ?? null
  // --db-path targets an arbitrary DB file (dev/CI schema smoke tests) so the
  // real postie.db is never touched by automated runs.
  const dbPathIdx = argv.indexOf('--db-path')
  const dbPathOverride = dbPathIdx !== -1 ? argv[dbPathIdx + 1] : undefined

  const { readFileSync, existsSync, unlinkSync } = await import('node:fs')
  const { createInterface } = await import('node:readline')
  const Database = (await import('better-sqlite3')).default
  const bcrypt = (await import('bcryptjs')).default

  const schemaPath = resolveSchemaPath()
  const dbPath = dbPathOverride
    ? resolve(dbPathOverride)
    : resolveDbPath()

  if (fresh && existsSync(dbPath)) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const f = dbPath + suffix
      if (existsSync(f)) unlinkSync(f)
    }
    console.log('  ✓ Existing DB removed (--fresh)')
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(readFileSync(schemaPath, 'utf8'))
  console.log('  ✓ Schema loaded')

  const ask = (q: string) => new Promise<string>((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(q, (a) => { rl.close(); res(a.trim()) })
  })
  const pw = password ?? await ask('Enter admin password (min 6 chars): ')
  if (pw.length < 6) { console.error('Password too short.'); app.exit(1); return }
  const hash = bcrypt.hashSync(pw, 10)
  db.prepare(`INSERT OR IGNORE INTO users (username, password_hash, display_name, role, is_active) VALUES ('admin', ?, 'Administrator', 0, 1)`).run(hash)
  console.log('  ✓ Admin user created')

  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
  console.log(`\n  Tables (${tables.length}): ${tables.map(t => t.name).join(', ')}`)
  console.log(`\n✓ Done.\n`)
  db.close()
  app.exit(0)
}

const isDev = !app.isPackaged

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Postie POS',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (process.argv.includes('--init-db')) {
    try {
      await runInitDbMode()
    } catch (err) {
      console.error('[init-db] FAILED:', err)
      app.exit(1)
    }
    return
  }

  // --migrate: open the DB through getDb() (which applies pending schema
  // migrations) and exit without a window. Dev/CI diagnostic — also how an
  // existing postie.db is upgraded non-interactively after an app update.
  if (process.argv.includes('--migrate')) {
    try {
      const db = getDb()
      const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
      console.log(`✓ Migration complete at ${resolveDbPath()}`)
      console.log(`  Tables (${tables.length}): ${tables.map(t => t.name).join(', ')}`)
      closeDb()
      app.exit(0)
    } catch (err) {
      console.error('[migrate] FAILED:', err)
      app.exit(1)
    }
    return
  }

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  closeDb()
})
