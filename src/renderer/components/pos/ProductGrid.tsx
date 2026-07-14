// ============================================================================
//  Postie POS - Product grid (Register, left panel)
// ----------------------------------------------------------------------------
//  Renders a responsive grid of product cards. Clicking a card adds it to the
//  cart. Out-of-stock products are dimmed and disabled. Stock is shown as a
//  small badge so the cashier can see availability at a glance.
// ============================================================================

import { formatVnd } from '@renderer/lib/format'
import type { Product } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'

interface ProductGridProps {
  products: Product[]
  onAdd: (product: Product) => void
}

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center text-muted-foreground">
        Nhập tên hoặc mã vạch để tìm sản phẩm.
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto p-3"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '12px',
        alignContent: 'start'
      }}
    >
      {products.map((p) => {
        const out = p.stock <= 0
        return (
          <button
            key={p.id}
            disabled={out}
            onClick={() => onAdd(p)}
            className={cn(
              'flex flex-col rounded-lg border bg-card p-3 text-left transition-all hover:border-primary hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:shadow-none'
            )}
          >
            <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">
              {p.name}
            </div>
            <div className="mt-2 text-lg font-bold text-primary">{formatVnd(p.price)}</div>
            <div className="mt-1">
              {out ? (
                <Badge variant="destructive">Hết hàng</Badge>
              ) : (
                <Badge variant="secondary">còn {p.stock}</Badge>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
