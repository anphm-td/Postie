// ============================================================================
//  Postie POS - Bảng doanh thu theo NHÓM HÀNG (api.reports.revenueByCategory)
// ----------------------------------------------------------------------------
//  Sản phẩm không gắn nhóm → category_name = 'Chưa phân loại' (phía repo).
//  Tỷ trọng = net_revenue / Σ net_revenue (thanh mini trong ô).
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
import type { CategoryRevenueRow } from './reportTypes'

export function CategoryRevenueTable({ rows }: { rows: CategoryRevenueRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Chưa có doanh thu theo nhóm hàng" hint="Gán nhóm cho sản phẩm ở màn Kho hàng để xem báo cáo theo nhóm." />
  }

  const totalNet = rows.reduce((s, r) => s + r.net_revenue, 0)

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Nhóm hàng</TableHead>
            <TableHead className="text-right">SL bán</TableHead>
            <TableHead className="text-right">Doanh thu (chưa trừ thuế)</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Lợi nhuận gộp</TableHead>
            <TableHead className="w-48">Tỷ trọng</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const share = totalNet > 0 ? Math.round((r.net_revenue / totalNet) * 100) : 0
            return (
              <TableRow key={r.category_id ?? 'none'}>
                <TableCell className="font-medium">{r.category_name}</TableCell>
                <TableCell className="text-right tabular-nums">{r.qty_sold}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatVnd(r.net_revenue)}</TableCell>
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
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {share}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
