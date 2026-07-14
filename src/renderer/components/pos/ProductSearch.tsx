// ============================================================================
//  Postie POS - Product search bar (Register)
// ----------------------------------------------------------------------------
//  Searches by product name OR barcode with a 250ms debounce, and reports the
//  results up so ProductGrid can render them. Pressing Enter first tries an
//  exact barcode lookup (for barcode scanners / typed codes) and adds the match
//  straight to the cart; otherwise it adds the first search result. The
//  `onAddToCart` callback fires whenever a product should be added directly.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '@renderer/lib/api'
import type { Product } from '@shared/types'
import { Input } from '@renderer/components/ui/input'

interface ProductSearchProps {
  /** Called with results and whether a search query is currently active. */
  onResults: (items: Product[], searching: boolean) => void
  onAddToCart: (product: Product) => void
}

export function ProductSearch({ onResults, onAddToCart }: ProductSearchProps) {
  const [query, setQuery] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const q = query.trim()
    if (!q) {
      onResults([], false)
      return
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await api.products.list({ search: q, activeOnly: true, pageSize: 60 })
        onResults(res.items, true)
      } catch {
        onResults([], true)
      }
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, onResults])

  async function handleEnter() {
    const q = query.trim()
    if (!q) return
    // Barcode scanners fire Enter after the code; try an exact match first.
    try {
      const exact = await api.products.getByBarcode(q)
      if (exact && exact.is_active === 1) {
        onAddToCart(exact)
        setQuery('')
        onResults([], false)
        return
      }
    } catch {
      /* fall through to name search */
    }
    // No exact barcode match: add the first search result if any.
    try {
      const res = await api.products.list({ search: q, activeOnly: true, pageSize: 1 })
      if (res.items.length > 0) {
        onAddToCart(res.items[0])
        setQuery('')
        onResults([], false)
      }
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleEnter()
        }}
        placeholder="Tìm tên sản phẩm hoặc quét mã vạch…"
        className="pl-9"
        autoFocus
      />
    </div>
  )
}
