// ============================================================================
//  Postie POS - Thẻ số liệu tổng hợp cho màn Báo cáo (từ SalesSummary)
// ----------------------------------------------------------------------------
//  Nguồn: api.reports.getSalesSummary(range) — electron/db/repositories/
//  reports.ts. Đơn vị tiền là INTEGER cents → formatVnd.
//  Quy ước repo: "Lợi nhuận gộp" = doanh thu − thuế − giá vốn (thuế GTGT là
//  tiền thu hộ, không phải lợi nhuận); chỉ đếm đơn status IN (1, 4).
// ============================================================================

import { Card, CardContent } from '@renderer/components/ui/card'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { formatVnd } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { SalesSummary } from './reportTypes'

export interface StatCardProps {
  label: string
  value: string
  hint?: string
  mono?: boolean
  tone?: 'default' | 'positive' | 'negative' | 'warning'
}

export function StatCard({ label, value, hint, mono, tone = 'default' }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className={cn(
            'mt-1 text-xl font-bold tabular-nums',
            mono && 'font-mono',
            tone === 'positive' && 'text-emerald-700',
            tone === 'negative' && 'text-destructive',
            tone === 'warning' && 'text-amber-600'
          )}
        >
          {value}
        </div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-32" />
      </CardContent>
    </Card>
  )
}

/**
 * 9 thẻ tổng hợp của tab "Tổng quan": số đơn, doanh thu, lợi nhuận gộp, đã
 * thu, còn nợ, thuế, giảm giá cấp đơn, giá vốn, TB/đơn.
 */
export function SummaryCards({
  summary,
  loading
}: {
  summary: SalesSummary | null
  loading: boolean
}) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  const profit = summary.gross_profit
  const outstanding = Math.max(0, summary.outstanding)

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Số đơn" value={summary.order_count.toLocaleString('vi-VN')} />
      <StatCard label="Doanh thu" value={formatVnd(summary.revenue)} mono hint="Sau giảm giá, gồm thuế" />
      <StatCard
        label="Lợi nhuận gộp"
        value={formatVnd(profit)}
        mono
        tone={profit > 0 ? 'positive' : profit < 0 ? 'negative' : 'default'}
        hint="Doanh thu − thuế − giá vốn"
      />
      <StatCard label="Đã thu" value={formatVnd(summary.collected)} mono />
      <StatCard
        label="Còn nợ"
        value={formatVnd(outstanding)}
        mono
        tone={outstanding > 0 ? 'negative' : 'default'}
      />
      <StatCard label="Thuế GTGT" value={formatVnd(summary.tax_total)} mono />
      <StatCard
        label="Giảm giá cấp đơn"
        value={formatVnd(summary.discount_total)}
        mono
        hint="Không gồm giảm giá theo dòng"
      />
      <StatCard label="Giá vốn" value={formatVnd(summary.cogs)} mono />
      <StatCard label="Trung bình / đơn" value={formatVnd(summary.avg_order_value)} mono />
    </div>
  )
}
