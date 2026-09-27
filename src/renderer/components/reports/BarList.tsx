// ============================================================================
//  Postie POS - BarList: danh sách thanh ngang (theo phương thức CK, nhóm
//  hàng, top bán chạy...). Thuần Tailwind — không thêm dependency biểu đồ.
// ============================================================================

import { Inbox } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface BarItem {
  key: string | number
  label: string
  value: number
  hint?: string
}

interface BarListProps {
  items: BarItem[]
  format: (value: number) => string
  emptyText?: string
  className?: string
}

export function BarList({ items, format, emptyText = 'Chưa có dữ liệu', className }: BarListProps) {
  if (items.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-2 py-10 text-center', className)}>
        <Inbox className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    )
  }

  const max = Math.max(...items.map((i) => i.value), 1)

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item) => {
        const pct = item.value > 0 ? Math.max((item.value / max) * 100, 2) : 0
        return (
          <div key={item.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate" title={item.hint ?? item.label}>
                {item.label}
              </span>
              <span className="shrink-0 font-mono tabular-nums">{format(item.value)}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
