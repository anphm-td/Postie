// ============================================================================
//  Postie POS - DailyRevenueChart: biểu đồ CỘT doanh thu theo ngày (CSS thuần)
// ----------------------------------------------------------------------------
//  Dữ liệu: api.reports.revenueByDay(range) — repo trả MỚI NHẤT TRƯỚC, chart
//  đảo lại để đọc từ trái (cũ) sang phải (mới), hiển thị tối đa 14 ngày.
// ============================================================================

import { formatVnd } from '@renderer/lib/format'
import type { DailyRevenueRow } from './reportTypes'

const MAX_BARS = 14

function dayLabel(day: string): string {
  // day là 'YYYY-MM-DD' (giờ máy quầy)
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`
}

function dayTitle(row: DailyRevenueRow): string {
  const date = `${dayLabel(row.day)}/${row.day.slice(0, 4)}`
  return `${date} · ${row.order_count} đơn · doanh thu ${formatVnd(row.revenue)} · lợi nhuận ${formatVnd(row.gross_profit)}`
}

export function DailyRevenueChart({ rows }: { rows: DailyRevenueRow[] }) {
  const data = rows.slice(0, MAX_BARS).reverse()
  if (data.length === 0) return null

  const max = Math.max(...data.map((r) => r.revenue), 1)

  return (
    <div className="flex h-48 items-end gap-1.5">
      {data.map((row) => {
        const pct = row.revenue > 0 ? Math.max((row.revenue / max) * 100, 2) : 0
        return (
          <div
            key={row.day}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            title={dayTitle(row)}
          >
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-sm bg-primary/85 transition-colors hover:bg-primary"
                style={{ height: `${pct}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] leading-none text-muted-foreground">
              {dayLabel(row.day)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
