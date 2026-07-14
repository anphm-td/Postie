// ============================================================================
//  Postie POS - Auth context
// ----------------------------------------------------------------------------
//  Auto-login mode: on mount, fetches the default admin via api.users.autoLogin
//  (no password) and uses it as the current user. There is no login screen.
//  The active shift (if any) is also fetched so every screen knows whether
//  the cashier can ring sales.
// ============================================================================

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import type { User, Shift } from '@shared/types'

interface AuthState {
  user: User | null
  activeShift: Shift | null
  loading: boolean          // true during initial auto-login
  refreshShift: () => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(true)

  // Auto-login: fetch the default admin on mount. No password prompt.
  useEffect(() => {
    let cancelled = false
    api.users.autoLogin()
      .then((u) => { if (!cancelled) setUser(u ?? null) })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const refreshShift = useCallback(async () => {
    if (!user) { setActiveShift(null); return }
    try {
      const shift = await api.shifts.getActive(user.id)
      setActiveShift(shift ?? null)
    } catch {
      setActiveShift(null)
    }
  }, [user])

  // Whenever the user changes, re-fetch their active shift.
  useEffect(() => { void refreshShift() }, [user, refreshShift])

  const logout = useCallback(() => {
    // In auto-login mode logout just clears state; re-mount re-logs in.
    setUser(null)
    setActiveShift(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, activeShift, loading, refreshShift, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
