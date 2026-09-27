// ============================================================================
//  Postie POS - useAsync: hook nạp dữ liệu IPC cho các panel Báo cáo
// ----------------------------------------------------------------------------
//  Trả { data, loading, error } — error giữ Message kể cả khi preload/repo
//  throw tiếng Việt. Không tự toast để tránh spam khi chuyển tab.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import type { DependencyList } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export function useAsync<T>(loader: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))

    loader().then(
      (data) => {
        if (!cancelled && alive.current) setState({ data, loading: false, error: null })
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Không tải được dữ liệu báo cáo.'
        if (!cancelled && alive.current) setState({ data: null, loading: false, error: message })
      }
    )

    return () => {
      cancelled = true
      alive.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
