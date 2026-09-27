import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '@renderer/lib/api'
import type { User, Shift } from '@shared/types'

const SESSION_KEY = 'postie.session.userId'

interface AuthState {
  user: User | null
  activeShift: Shift | null
  loading: boolean
  refreshShift: () => Promise<void>
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [activeShift, setActiveShift] = useState<Shift | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const savedId = Number(localStorage.getItem(SESSION_KEY))
    if (!savedId) {
      setLoading(false)
      return
    }
    api.users.getById(savedId)
      .then((u) => { if (!cancelled) setUser(u && u.is_active === 1 ? u : null) })
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

  useEffect(() => { void refreshShift() }, [user, refreshShift])

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    const u = await api.users.login(username, password)
    if (u) {
      localStorage.setItem(SESSION_KEY, String(u.id))
      setUser(u)
      return true
    }
    return false
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
    setActiveShift(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, activeShift, loading, refreshShift, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
