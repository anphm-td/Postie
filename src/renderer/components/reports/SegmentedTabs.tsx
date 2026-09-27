// ============================================================================
//  Postie POS - SegmentedTabs: dải tab phân đoạn (cùng phong cách với bộ lọc
//  "Ca hiện tại / 50 đơn gần nhất" của màn Báo cáo cũ).
//  Tràn ngang → cuộn được trên màn hẹp, không xuống dòng loạn.
// ============================================================================

import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export interface TabDef {
  id: string
  label: string
  icon?: LucideIcon
}

interface SegmentedTabsProps {
  tabs: TabDef[]
  active: string
  onChange: (id: string) => void
}

export function SegmentedTabs({ tabs, active, onChange }: SegmentedTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active === id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          {Icon && <Icon className="h-4 w-4" />}
          {label}
        </button>
      ))}
    </div>
  )
}
