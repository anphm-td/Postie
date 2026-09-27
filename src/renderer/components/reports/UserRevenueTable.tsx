// ============================================================================
//  Postie POS - Báo cáo hiệu quả nhân viên (P0.6 — api.reports.revenueByUser)
// ----------------------------------------------------------------------------
//  GROUP BY orders.user_id (index idx_orders_user) phía repo; discount_total
//  là giảm giá CẤP ĐƠN. LN/đơn = gross_profit / order_count (mốc tham khảo).
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
import { signedVnd } from './reportTypes'
import { EmptyState } from './EmptyState'
import type { UserRevenueRow } from './reportTypes'

export function UserRevenueTable({ rows }: { rows: UserRevenueRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Chưa có đơn nào của nhân viên trong khoảng này" />
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Nhân viên</TableHead>
            <TableHead className="text-right">Số đơn</TableHead>
            <TableHead className="text-right">Doanh thu</TableHead>
            <TableHead className="text-right">Giảm giá cấp đơn</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Lợi nhuận gộp</TableHead>
            <TableHead className="text-right">TB lợi nhuận/đơn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const perOrder = r.order_count > 0 ? Math.round(r.gross_profit / r.order_count) : 0
            return (
              <TableRow key={r.user_id}>
                <TableCell>
                  <div className="font-medium">{r.user_name}</div>
                  <div className="text-xs text-muted-foreground">@{r.username}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.order_count}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatVnd(r.revenue)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatVnd(r.discount_total)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatVnd(r.cogs)}
                </TableCell>
                <TableCell
                  className={`text-right font-mono font-semibold tabular-nums ${
                    r.gross_profit < 0 ? 'text-destructive' : ''
                  }`}
                >
                  {signedVnd(r.gross_profit)}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {formatVnd(perOrder)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
