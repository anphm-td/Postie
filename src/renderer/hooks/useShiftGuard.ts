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

  const needsShift = !!user && !activeShift
  return { needsShift, shiftLoading }
}
