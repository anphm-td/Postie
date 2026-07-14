// ============================================================================
//  Postie POS - Users repository (login / RBAC)
// ============================================================================

import bcrypt from 'bcryptjs'
import { getDb } from '../connection.js'
import type { User } from '../../../src/shared/types.js'

interface UserRow {
  id: number
  username: string
  password_hash: string
  display_name: string
  role: number
  is_active: number
  created_at: number
}

/** Lookup a user by username (case-insensitive, schema enforces this). */
export function findByUsername(username: string): UserRow | undefined {
  return getDb().prepare(
    `SELECT id, username, password_hash, display_name, role, is_active, created_at
       FROM users WHERE username = ?`
  ).get(username) as UserRow | undefined
}

/** Verify a plaintext password against the stored bcrypt hash. */
export function verifyPassword(user: UserRow, password: string): boolean {
  if (!user.is_active) return false
  return bcrypt.compareSync(password, user.password_hash)
}

/**
 * Authenticate by username + password.
 * Returns the public User object (without password_hash) on success,
 * or null if the credentials are invalid or the user is inactive.
 */
export function login(username: string, password: string): User | null {
  const user = findByUsername(username)
  if (!user) return null
  if (!verifyPassword(user, password)) return null
  // Strip password_hash before returning
  const { password_hash: _omit, ...publicUser } = user
  return publicUser as User
}

/** List all users (admin/manager only — enforce in the caller). */
export function listAll(): User[] {
  return getDb().prepare(
    `SELECT id, username, display_name, role, is_active, created_at
       FROM users ORDER BY id`
  ).all() as User[]
}

/**
 * Return the first active admin user, without password verification.
 * Used for the auto-login flow (dev / single-operator mode) where the
 * register opens straight into the sales screen. NOT a security boundary.
 */
export function getDefaultAdmin(): User | undefined {
  return getDb().prepare(
    `SELECT id, username, display_name, role, is_active, created_at
       FROM users
      WHERE role = 0 AND is_active = 1
      ORDER BY id
      LIMIT 1`
  ).get() as User | undefined
}
