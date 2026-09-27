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
