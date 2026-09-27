// ============================================================================
//  Postie POS - Bảng doanh thu theo SẢN PHẨM (api.reports.revenueByProduct)
// ----------------------------------------------------------------------------
//  net_revenue = gross_sales − discount_total (giảm giá THEO DÒNG, chưa trừ
//  thuế/giảm giá cấp đơn — quy ước của reports repo). Biên LN = profit/net.
// ============================================================================

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import { Badge } from '@renderer/components/ui/badge'
import { formatVnd } from '@renderer/lib/format'
import { signedVnd } from './reportTypes'
import { EmptyState } from './EmptyState'
import type { ProductRevenueRow } from './reportTypes'

export function ProductRevenueTable({ rows }: { rows: ProductRevenueRow[] }) {
  if (rows.length === 0) {
    return <EmptyState title="Chưa bán được sản phẩm nào trong khoảng này" />
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Sản phẩm</TableHead>
            <TableHead className="text-right">SL bán</TableHead>
            <TableHead className="text-right">Trước giảm giá</TableHead>
            <TableHead className="text-right">Giảm giá dòng</TableHead>
            <TableHead className="text-right">Doanh thu net</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Lợi nhuận gộp</TableHead>
            <TableHead className="text-right">Biên LN</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const margin = r.net_revenue > 0 ? Math.round((r.gross_profit / r.net_revenue) * 100) : 0
            return (
              <TableRow key={r.product_id}>
                <TableCell className="max-w-64">
                  <div className="font-medium">{r.product_name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {r.barcode && <span className="font-mono">{r.barcode}</span>}
                    {r.category_name && <Badge variant="outline">{r.category_name}</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.qty_sold}
                  {r.unit ? <span className="text-muted-foreground"> {r.unit}</span> : null}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatVnd(r.gross_sales)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {r.discount_total > 0 ? `−${formatVnd(r.discount_total)}` : '—'}
                </TableCell>
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
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {r.net_revenue > 0 ? `${margin}%` : '—'}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
