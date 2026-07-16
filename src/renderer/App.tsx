// ============================================================================
//  Postie POS - App root with route guard
// ----------------------------------------------------------------------------
//  Simple state-based routing (no react-router needed for a few screens).
//  The guard enforces: DB not set up -> FirstRunSetup; not logged in ->
//  Login; logged in but no active shift -> ShiftOpen; otherwise -> the main
//  app shell. Admin/manager screens are reachable from a sidebar once
//  authenticated.
// ============================================================================

import React, { useState } from 'react'
import { AuthProvider, useAuth } from '@renderer/context/AuthContext'
import { FirstRunSetup } from '@renderer/routes/FirstRunSetup'
import { Login } from '@renderer/routes/Login'
import { ShiftOpen } from '@renderer/routes/ShiftOpen'
import { Register } from '@renderer/routes/Register'
import { Products } from '@renderer/routes/Products'
import { Reports } from '@renderer/routes/Reports'
import { CloseShiftDialog } from '@renderer/components/pos/CloseShiftDialog'
import { useSetupGuard } from '@renderer/hooks/useSetupGuard'
import { useShiftGuard } from '@renderer/hooks/useShiftGuard'

type Screen = 'register' | 'products' | 'customers' | 'reports'

function Shell() {
  const { needsSetup, setupLoading, recheck } = useSetupGuard()
  const { user, activeShift, loading, refreshShift, logout } = useAuth()
  const { needsShift, shiftLoading } = useShiftGuard()
  const [screen, setScreen] = useState<Screen>('register')
  const [showClose, setShowClose] = useState(false)

  // Fresh install / freshly downloaded .exe: no DB or no users yet. This
  // must be checked before anything auth-related — there's no admin to log
  // in as until this screen creates one.
  if (setupLoading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Đang tải…</div>
  }
  if (needsSetup) return <FirstRunSetup onDone={recheck} />

  if (loading || (user && shiftLoading)) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Đang tải…</div>
  }
  if (!user) return <Login />
  if (needsShift) return <ShiftOpen />

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 border-r bg-card flex flex-col">
        <div className="p-4 border-b">
          <div className="font-semibold">Postie POS</div>
          <div className="text-xs text-muted-foreground mt-1">{user.display_name}</div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          <NavBtn active={screen === 'register'} onClick={() => setScreen('register')}>Bán hàng</NavBtn>
          <NavBtn active={screen === 'products'} onClick={() => setScreen('products')}>Kho hàng</NavBtn>
          <NavBtn active={screen === 'reports'} onClick={() => setScreen('reports')}>Báo cáo</NavBtn>
          <NavBtn active={screen === 'customers'} onClick={() => setScreen('customers')}>Khách hàng</NavBtn>
        </nav>
        <div className="border-t p-2 space-y-1">
          {activeShift && (
            <button
              onClick={() => setShowClose(true)}
              className="w-full text-left px-3 py-2 rounded-md text-sm text-destructive transition-colors hover:bg-destructive/10"
            >
              Đóng ca
            </button>
          )}
          <button
            onClick={logout}
            className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {screen === 'register' && <Register />}
        {screen === 'products' && <Products />}
        {screen === 'customers' && <Placeholder title="Khách hàng & công nợ" />}
        {screen === 'reports' && <Reports />}
      </main>

      {showClose && (
        <CloseShiftDialog
          shift={activeShift}
          userName={user.display_name}
          onClose={() => setShowClose(false)}
          onClosed={refreshShift}
        />
      )}
    </div>
  )
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
      }`}
    >
      {children}
    </button>
  )
}

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground mt-2">Màn hình này sẽ được xây dựng ở bước sau.</p>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
