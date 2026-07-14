// One-off: verify admin login from inside Electron (better-sqlite3 is built
// for the Electron ABI). Run with: npx electron . --test-login <password>
import { app } from 'electron'
import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'

app.whenReady().then(async () => {
  const argv = process.argv.slice(process.argv.indexOf('--test-login') + 1)
  const password = argv[0] ?? ''
  const dbPath = resolve(app.getAppPath(), 'postie.db')

  try {
    const db = new Database(dbPath)
    const u = db.prepare('SELECT id, username, password_hash, display_name, role, is_active FROM users WHERE username = ?').get('admin') as
      | { id: number; username: string; password_hash: string; display_name: string; role: number; is_active: number }
      | undefined

    if (!u) {
      console.log('FAIL: admin user not found in DB')
      app.exit(1); return
    }

    console.log('User row:', { id: u.id, username: u.username, display_name: u.display_name, role: u.role, is_active: u.is_active })
    console.log('Hash prefix:', u.password_hash.slice(0, 25) + '...')
    console.log('---')
    console.log(`Login "${password}":`, bcrypt.compareSync(password, u.password_hash) ? 'OK ✓' : 'FAIL ✗')
    console.log('Login "admin123":', bcrypt.compareSync('admin123', u.password_hash) ? 'OK ✓' : 'FAIL ✗')
    db.close()
    app.exit(0)
  } catch (err) {
    console.error('ERROR:', err)
    app.exit(1)
  }
})
