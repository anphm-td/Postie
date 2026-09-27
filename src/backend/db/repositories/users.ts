// ============================================================================
//  Postie POS - Users repository (login / RBAC)
// ============================================================================

import bcrypt from 'bcryptjs'
import { prepare } from '../connection.js'
import type { User } from '@shared/types'

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
  return prepare(
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
  return prepare(
    `SELECT id, username, display_name, role, is_active, created_at
       FROM users ORDER BY id`
  ).all() as User[]
}

/** Get a user by id (without password_hash). Used to restore a saved session. */
export function getById(id: number): User | undefined {
  return prepare(
    `SELECT id, username, display_name, role, is_active, created_at
       FROM users WHERE id = ?`
  ).get(id) as User | undefined
}

