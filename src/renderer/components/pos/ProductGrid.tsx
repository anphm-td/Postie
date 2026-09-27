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
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-10 text-center text-muted-foreground">
        <p className="font-medium">Không tìm thấy sản phẩm</p>
        <p className="text-sm">Thử tên khác hoặc quét mã vạch.</p>
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto p-3"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
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
              'flex flex-col rounded-xl border bg-card p-3.5 text-left shadow-sm transition-all',
              'hover:-translate-y-0.5 hover:border-primary hover:shadow-md',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:shadow-sm'
            )}
          >
            <div className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug">
              {p.name}
            </div>
            <div className="mt-2 font-mono text-lg font-bold tabular-nums text-primary">
              {formatVnd(p.price)}
            </div>
            <div className="mt-1.5">
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
