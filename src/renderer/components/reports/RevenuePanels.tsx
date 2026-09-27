// ============================================================================
//  Postie POS - Các panel doanh thu theo chiều (ngày / ca / nhân viên /
//  sản phẩm / nhóm hàng) của màn Báo cáo — mỗi panel tự nạp dữ liệu qua IPC
//  reports:* với cùng ReportRange + refreshKey.
// ============================================================================

import { useState } from 'react'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { api } from '@renderer/lib/api'
import { useAsync } from './useAsync'
import { toReportRange } from './reportTypes'
import { DailyRevenueTable } from './DailyRevenueTable'
import { ShiftRevenueTable } from './ShiftRevenueTable'
import { UserRevenueTable } from './UserRevenueTable'
import { ProductRevenueTable } from './ProductRevenueTable'
import { CategoryRevenueTable } from './CategoryRevenueTable'
import type { PanelProps } from './OverviewPanel'

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

function PanelError({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm text-destructive">{message}</p>
}

/** Tab "Theo ngày" — api.reports.revenueByDay. */
export function DailyPanel({ range, refreshKey }: PanelProps) {
  const r = toReportRange(range)
  const { data, loading, error } = useAsync(() => api.reports.revenueByDay(r), [
    r.from,
    r.to,
    refreshKey
  ])

  if (loading) return <TableSkeleton />
  if (error) return <PanelError message={error} />
  return <DailyRevenueTable rows={data ?? []} />
}

/** Tab "Theo ca" — api.reports.revenueByShift. */
export function ShiftPanel({ range, refreshKey }: PanelProps) {
  const r = toReportRange(range)
  const { data, loading, error } = useAsync(() => api.reports.revenueByShift(r), [
    r.from,
    r.to,
    refreshKey
  ])

  if (loading) return <TableSkeleton />
  if (error) return <PanelError message={error} />
  return <ShiftRevenueTable rows={data ?? []} />
}

/** Tab "Nhân viên" — api.reports.revenueByUser (P0.6). */
export function UserPanel({ range, refreshKey }: PanelProps) {
  const r = toReportRange(range)
  const { data, loading, error } = useAsync(() => api.reports.revenueByUser(r), [
    r.from,
    r.to,
    refreshKey
  ])

  if (loading) return <TableSkeleton />
  if (error) return <PanelError message={error} />
  return <UserRevenueTable rows={data ?? []} />
}

/** Tab "Nhóm hàng" — api.reports.revenueByCategory. */
export function CategoryPanel({ range, refreshKey }: PanelProps) {
  const r = toReportRange(range)
  const { data, loading, error } = useAsync(() => api.reports.revenueByCategory(r), [
    r.from,
    r.to,
    refreshKey
  ])

  if (loading) return <TableSkeleton />
  if (error) return <PanelError message={error} />
  return <CategoryRevenueTable rows={data ?? []} />
}

/** Tab "Sản phẩm" — api.reports.revenueByProduct + bộ chọn sắp xếp/top N. */
export function ProductPanel({ range, refreshKey }: PanelProps) {
  const [orderBy, setOrderBy] = useState<'revenue' | 'qty'>('revenue')
  const [limit, setLimit] = useState<number | undefined>(25)

  const r = toReportRange(range)
  const { data, loading, error } = useAsync(
    () => api.reports.revenueByProduct({ ...r, orderBy, limit }),
    [r.from, r.to, orderBy, limit, refreshKey]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          <button
            onClick={() => setOrderBy('revenue')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              orderBy === 'revenue'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            Theo doanh thu
          </button>
          <button
            onClick={() => setOrderBy('qty')}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              orderBy === 'qty'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
          >
            Theo số lượng
          </button>
        </div>
        <select
          value={limit === undefined ? 'all' : String(limit)}
          onChange={(e) => setLimit(e.target.value === 'all' ? undefined : Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Số dòng hiển thị"
        >
          <option value="10">Top 10</option>
          <option value="25">Top 25</option>
          <option value="50">Top 50</option>
          <option value="all">Tất cả</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <PanelError message={error} />
      ) : (
        <ProductRevenueTable rows={data ?? []} />
      )}
    </div>
  )
}
