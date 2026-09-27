// ============================================================================
//  Postie POS - OverviewPanel: tab "Tổng quan" của màn Báo cáo
// ----------------------------------------------------------------------------
//  Nạp: getSalesSummary + revenueByDay + revenueByPaymentMethod + topProducts
//  (cùng khoảng ReportRange). Biểu đồ + bar list thuần Tailwind/CSS — KHÔNG
//  thêm dependency biểu đồ (recharts v.v.).
// ============================================================================

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { useAsync } from './useAsync'
import { SummaryCards } from './SummaryCards'
import { DailyRevenueChart } from './DailyRevenueChart'
import { BarList } from './BarList'
import { EmptyState } from './EmptyState'
import { toReportRange } from './reportTypes'
import type { DateRange } from './DateRangePicker'

export interface PanelProps {
  range: DateRange
  refreshKey: number
}

function PanelError({ message }: { message: string }) {
  return <p className="py-10 text-center text-sm text-destructive">{message}</p>
}

export function OverviewPanel({ range, refreshKey }: PanelProps) {
  const r = toReportRange(range)

  const summary = useAsync(() => api.reports.getSalesSummary(r), [r.from, r.to, refreshKey])
  const daily = useAsync(() => api.reports.revenueByDay(r), [r.from, r.to, refreshKey])
  const payments = useAsync(() => api.reports.revenueByPaymentMethod(r), [r.from, r.to, refreshKey])
  const top = useAsync(() => api.reports.topProducts({ ...r, limit: 5 }), [r.from, r.to, refreshKey])

  const dailyRows = daily.data ?? []
  const paymentItems = (payments.data ?? []).map((p) => ({
    key: p.payment_method_id,
    label: p.name,
    value: p.total,
    hint: `${p.payment_count} dòng thanh toán (${p.code})`
  }))
  const topItems = (top.data ?? []).map((p) => ({
    key: p.product_id,
    label: p.product_name,
    value: p.qty_sold,
    hint: `${p.qty_sold} ${p.unit ?? ''} · doanh thu ${formatVnd(p.net_revenue)}`.trim()
  }))

  return (
    <div className="space-y-5">
      <SummaryCards summary={summary.data} loading={summary.loading} />
      {summary.error && <p className="text-sm text-destructive">Không tải được tổng hợp: {summary.error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Doanh thu theo ngày</CardTitle>
            <CardDescription>Các ngày gần nhất trong khoảng đã chọn</CardDescription>
          </CardHeader>
          <CardContent>
            {daily.loading ? (
              <Skeleton className="h-48 w-full" />
            ) : daily.error ? (
              <PanelError message={daily.error} />
            ) : dailyRows.length === 0 ? (
              <EmptyState title="Chưa có doanh thu trong khoảng này" />
            ) : (
              <DailyRevenueChart rows={dailyRows} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Theo phương thức thanh toán</CardTitle>
            <CardDescription>Tổng tiền đã thu theo từng phương thức</CardDescription>
          </CardHeader>
          <CardContent>
            {payments.loading ? (
              <Skeleton className="h-40 w-full" />
            ) : payments.error ? (
              <PanelError message={payments.error} />
            ) : (
              <BarList items={paymentItems} format={formatVnd} emptyText="Chưa có dòng thanh toán nào" />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top 5 bán chạy</CardTitle>
          <CardDescription>Xếp theo số lượng bán trong khoảng đã chọn</CardDescription>
        </CardHeader>
        <CardContent>
          {top.loading ? (
            <Skeleton className="h-40 w-full" />
          ) : top.error ? (
            <PanelError message={top.error} />
          ) : (
            <BarList items={topItems} format={(v) => `${v}`} emptyText="Chưa bán được sản phẩm nào" />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
