import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { api } from '@renderer/lib/api'
import type { Product } from '@shared/types'
import { Input } from '@renderer/components/ui/input'
import { beep } from '@renderer/components/pos/sound'

interface ProductSearchProps {
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
    try {
      const exact = await api.products.getByBarcode(q).catch(() => undefined)
      if (exact && exact.is_active === 1) {
        onAddToCart(exact)
        setQuery('')
        onResults([], false)
        return
      }
      const res = await api.products.list({ search: q, activeOnly: true, pageSize: 1 })
      if (res.items.length > 0) {
        onAddToCart(res.items[0])
        setQuery('')
        onResults([], false)
      } else {
        // Quét/tìm mã không khớp sản phẩm nào — âm báo lỗi + toast (P0.2).
        toast.error(`Không tìm thấy sản phẩm "${q}"`)
        beep('error')
      }
    } catch {
      onResults([], true)
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleEnter()
        }}
        placeholder="Tìm tên sản phẩm hoặc quét mã vạch…"
        className="h-11 pl-9 text-base"
        autoFocus
      />
    </div>
  )
}
