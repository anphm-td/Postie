// ============================================================================
//  Postie POS - First-run setup guard hook
// ----------------------------------------------------------------------------
//  Mirrors useShiftGuard: checks once on mount whether the app needs to show
//  FirstRunSetup (DB missing, or DB exists but has zero users — e.g. a fresh
//  install / freshly downloaded .exe that has never been run before).
//  `recheck` is called by FirstRunSetup after it successfully creates the
//  admin account, so the guard flips to false without a full app reload.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'

export function useSetupGuard() {
  const [needsSetup, setNeedsSetup] = useState(false)
  const [setupLoading, setSetupLoading] = useState(true)

  const check = useCallback(async () => {
    setSetupLoading(true)
    try {
      const result = await api.db.needsSetup()
      setNeedsSetup(result)
    } finally {
      setSetupLoading(false)
    }
  }, [])

  useEffect(() => {
    void check()
  }, [check])

  return { needsSetup, setupLoading, recheck: check }
}
