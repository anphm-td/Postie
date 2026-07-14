// ============================================================================
//  Postie POS - Shift guard hook
// ----------------------------------------------------------------------------
//  Wraps the "does the current user have an open shift?" check so App.tsx
//  can decide whether to show ShiftOpen or the main app. Re-runs whenever
//  the auth user changes.
// ============================================================================

import { useEffect, useState } from 'react'
import { useAuth } from '@renderer/context/AuthContext'

export function useShiftGuard() {
  const { user, activeShift, refreshShift } = useAuth()
  const [shiftLoading, setShiftLoading] = useState(true)

  useEffect(() => {
    if (!user) { setShiftLoading(false); return }
    setShiftLoading(true)
    refreshShift().finally(() => setShiftLoading(false))
  }, [user, refreshShift])

  // Needs shift screen if logged in but no active shift.
  const needsShift = !!user && !activeShift
  return { needsShift, shiftLoading }
}
