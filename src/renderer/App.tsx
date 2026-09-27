import React, { useState } from 'react'
import {
  BarChart3,
  ClipboardList,
  LogOut,
  Package,
  PauseCircle,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  Store,
  Truck,
  Users
} from 'lucide-react'
import { AuthProvider, useAuth } from '@renderer/context/AuthContext'
import { FirstRunSetup } from '@renderer/routes/FirstRunSetup'
import { Login } from '@renderer/routes/Login'
import { ShiftOpen } from '@renderer/routes/ShiftOpen'
import { Register } from '@renderer/routes/Register'
import { Invoices } from '@renderer/routes/Invoices'
import { Products } from '@renderer/routes/Products'
import { Purchases } from '@renderer/routes/Purchases'
import { Stocktakes } from '@renderer/routes/Stocktakes'
import { Returns } from '@renderer/routes/Returns'
import { Reports } from '@renderer/routes/Reports'
import { Customers } from '@renderer/routes/Customers'
import { CloseShiftDialog } from '@renderer/components/pos/CloseShiftDialog'
import { useSetupGuard } from '@renderer/hooks/useSetupGuard'
import { useShiftGuard } from '@renderer/hooks/useShiftGuard'
import { Toaster } from '@renderer/components/ui/sonner'
import { cn } from '@renderer/lib/utils'

type Screen =
  | 'register'
  | 'invoices'
  | 'returns'
  | 'products'
  | 'purchases'
  | 'stocktakes'
  | 'customers'
  | 'reports'

const NAV_ITEMS: Array<{ id: Screen; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'register', label: 'Bán hàng', icon: ShoppingCart },
  { id: 'invoices', label: 'Hóa đơn', icon: ReceiptText },
  { id: 'returns', label: 'Đổi trả', icon: RotateCcw },
  { id: 'products', label: 'Kho hàng', icon: Package },
  { id: 'purchases', label: 'Nhập hàng', icon: Truck },
  { id: 'stocktakes', label: 'Kiểm kê', icon: ClipboardList },
  { id: 'customers', label: 'Khách hàng', icon: Users },
  { id: 'reports', label: 'Báo cáo', icon: BarChart3 }
]

function LoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center gap-3 bg-background">
      <Store className="h-6 w-6 animate-pulse text-primary" />
      <span className="text-sm text-muted-foreground">Đang mở Postie…</span>
    </div>
  )
}

function Shell() {
  const { needsSetup, setupLoading, recheck } = useSetupGuard()
  const { user, activeShift, loading, refreshShift, logout } = useAuth()
  const { needsShift, shiftLoading } = useShiftGuard()
  const [screen, setScreen] = useState<Screen>('register')
  const [showClose, setShowClose] = useState(false)

  if (setupLoading) return <LoadingScreen />
  if (needsSetup) return <FirstRunSetup onDone={recheck} />

  if (loading || (user && shiftLoading)) return <LoadingScreen />
  if (!user) return <Login />
  if (needsShift) return <ShiftOpen />

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 flex-col border-r bg-card">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            P
          </div>
          <div>
            <div className="text-sm font-bold leading-tight">Postie POS</div>
            <div className="text-xs text-muted-foreground">{user.display_name}</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setScreen(id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                screen === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          ))}
        </nav>

        <div className="space-y-1 border-t p-3">
          {activeShift && (
            <button
              onClick={() => setShowClose(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-500/10"
            >
              <PauseCircle className="h-[18px] w-[18px]" />
              Đóng ca
            </button>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">
        {screen === 'register' && <Register />}
        {screen === 'invoices' && <Invoices />}
        {screen === 'returns' && <Returns />}
        {screen === 'products' && <Products />}
        {screen === 'purchases' && <Purchases />}
        {screen === 'stocktakes' && <Stocktakes />}
        {screen === 'customers' && <Customers />}
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

export default function App() {
  return (
    <AuthProvider>
      <Shell />
      <Toaster />
    </AuthProvider>
  )
}
