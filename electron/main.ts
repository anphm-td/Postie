// ============================================================================
//  Postie POS - Electron main process entry
// ----------------------------------------------------------------------------
//  Creates the BrowserWindow, registers IPC, and opens the DB. The renderer
//  (React) is loaded from the Vite dev server in development, or from the
//  built file in production.
//
//  Special mode: `electron . --init-db [--fresh] [--password <pw>]`
//  Runs the DB initializer inside the Electron process (required because
//  better-sqlite3 is rebuilt for the Electron ABI, not Node's) and exits
//  without opening a window.
// ============================================================================

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc.js'
import { closeDb } from './db/connection.js'

async function runInitDbMode(): Promise<void> {
  const argv = process.argv.slice(process.argv.indexOf('--init-db') + 1)
  const fresh = argv.includes('--fresh')
  let password: string | null = null
  const pwIdx = argv.indexOf('--password')
  if (pwIdx !== -1) password = argv[pwIdx + 1] ?? null

  // Inline the init logic so we don't have to share a module between Node-tsx
  // and Electron; the schema + admin seeding is small enough to keep here.
  const { readFileSync, existsSync, unlinkSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const { createInterface } = await import('node:readline')
  const Database = (await import('better-sqlite3')).default
  const bcrypt = (await import('bcryptjs')).default

  const schemaPath = resolve(__dirname, '../../db/schema.sql')
  const dbPath = resolve(app.getAppPath(), 'postie.db')

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

// Enable more verbose logs in development.
const isDev = !app.isPackaged

async function runTestLoginMode(): Promise<void> {
  const argv = process.argv.slice(process.argv.indexOf('--test-login') + 1)
  const password = argv[0] ?? ''
  const { resolve } = await import('node:path')
  const Database = (await import('better-sqlite3')).default
  const bcrypt = (await import('bcryptjs')).default

  const dbPath = resolve(app.getAppPath(), 'postie.db')
  const db = new Database(dbPath)
  const u = db.prepare(
    'SELECT id, username, password_hash, display_name, role, is_active FROM users WHERE username = ?'
  ).get('admin') as
    | { id: number; username: string; password_hash: string; display_name: string; role: number; is_active: number }
    | undefined

  if (!u) {
    console.log('FAIL: admin user not found in DB')
    db.close(); app.exit(1); return
  }

  console.log('User row:', { id: u.id, username: u.username, display_name: u.display_name, role: u.role, is_active: u.is_active })
  console.log('Hash prefix:', u.password_hash.slice(0, 25) + '...')
  console.log('---')
  console.log(`Login "${password}":`, bcrypt.compareSync(password, u.password_hash) ? 'OK ✓' : 'FAIL ✗')
  console.log('Login "admin123":', bcrypt.compareSync('admin123', u.password_hash) ? 'OK ✓' : 'FAIL ✗')
  console.log('Login "admin":', bcrypt.compareSync('admin', u.password_hash) ? 'OK ✓' : 'FAIL ✗')
  console.log('Login "" (empty):', bcrypt.compareSync('', u.password_hash) ? 'OK ✓' : 'FAIL ✗')
  db.close()
  app.exit(0)
}

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

  // Open external links in the default browser, not inside the app.
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
  // --init-db mode: run the DB initializer inside Electron (better-sqlite3
  // is rebuilt for the Electron ABI, not Node's), then quit without a window.
  if (process.argv.includes('--init-db')) {
    try {
      await runInitDbMode()
    } catch (err) {
      console.error('[init-db] FAILED:', err)
      app.exit(1)
    }
    return
  }

  // --test-login <password>: verify admin credentials. Diagnostic mode that
  // loads the DB (which Node cannot, due to the Electron ABI) and prints
  // whether the given password matches the admin hash. Exits without a window.
  if (process.argv.includes('--test-login')) {
    try {
      await runTestLoginMode()
    } catch (err) {
      console.error('[test-login] FAILED:', err)
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
