// ============================================================================
//  Postie POS - Bảng doanh thu theo NGÀY (api.reports.revenueByDay)
// ----------------------------------------------------------------------------
//  Row từ reports repo: day 'YYYY-MM-DD' (giờ máy quầy) mới nhất trước.
//  Cuối bảng có hàng Tổng cộng. Đơn vị tiền: INTEGER cents → formatVnd.
// ============================================================================

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import { formatVnd } from '@renderer/lib/format'
import { EmptyState } from './EmptyState'
import type { DailyRevenueRow } from './reportTypes'

/** 'YYYY-MM-DD' → 'dd/MM/yyyy' (hiển thị giờ máy quầy, không đổi múi giờ). */
function viDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`
}

interface Totals {
  order_count: number
  revenue: number
  tax_total: number
  cogs: number
  gross_profit: number
}

export function DailyRevenueTable({ rows }: { rows: DailyRevenueRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Chưa có doanh thu trong khoảng này"
        hint="Chỉ đếm đơn đã thanh toán hoặc một phần — đơn hủy/hoàn tiền không tính."
      />
    )
  }

  const t = rows.reduce<Totals>(
    (acc, r) => ({
      order_count: acc.order_count + r.order_count,
      revenue: acc.revenue + r.revenue,
      tax_total: acc.tax_total + r.tax_total,
      cogs: acc.cogs + r.cogs,
      gross_profit: acc.gross_profit + r.gross_profit
    }),
    { order_count: 0, revenue: 0, tax_total: 0, cogs: 0, gross_profit: 0 }
  )

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Ngày</TableHead>
            <TableHead className="text-right">Số đơn</TableHead>
            <TableHead className="text-right">Doanh thu</TableHead>
            <TableHead className="text-right">Thuế</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Lợi nhuận gộp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.day}>
              <TableCell className="font-medium">{viDay(r.day)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.order_count}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatVnd(r.revenue)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {formatVnd(r.tax_total)}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {formatVnd(r.cogs)}
              </TableCell>
              <TableCell
                className={`text-right font-mono font-semibold tabular-nums ${
                  r.gross_profit < 0 ? 'text-destructive' : ''
                }`}
              >
                {formatVnd(r.gross_profit)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="border-t-2 bg-secondary/50 font-semibold hover:bg-secondary/50">
            <TableCell>Tổng cộng</TableCell>
            <TableCell className="text-right tabular-nums">{t.order_count}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatVnd(t.revenue)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatVnd(t.tax_total)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatVnd(t.cogs)}</TableCell>
            <TableCell
              className={`text-right font-mono tabular-nums ${t.gross_profit < 0 ? 'text-destructive' : ''}`}
            >
              {formatVnd(t.gross_profit)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
