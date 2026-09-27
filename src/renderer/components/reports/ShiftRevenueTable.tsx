// ============================================================================
//  Postie POS - Bảng doanh thu theo CA (api.reports.revenueByShift)
// ----------------------------------------------------------------------------
//  Repo gom đơn không gắn ca về shift_id = NULL. Lưu ý khác Lịch sử ca: đây
//  chỉ là DOANH SỐ theo ca — tiền mặt đầu ca/đếm được xem ở components/shifts.
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
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { signedVnd } from './reportTypes'
import { EmptyState } from './EmptyState'
import type { ShiftRevenueRow } from './reportTypes'

function shiftStatusBadge(status: number | null) {
  // ShiftStatus: 0 = đang mở, 1 = đã kết thúc, 2 = đã đối soát (null = không gắn ca)
  if (status === 0) return <Badge className="bg-amber-500/15 text-amber-700">Đang mở</Badge>
  if (status === 1) return <Badge variant="secondary">Đã kết thúc</Badge>
  if (status === 2) return <Badge variant="outline">Đã đối soát</Badge>
  return <Badge variant="outline">Không gắn ca</Badge>
}

export function ShiftRevenueTable({ rows }: { rows: ShiftRevenueRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Chưa có đơn trong ca nào"
        hint="Đơn bán khi chưa mở ca sẽ được gom về dòng 'Không gắn ca'."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Ca</TableHead>
            <TableHead>Thu ngân</TableHead>
            <TableHead>Thời gian</TableHead>
            <TableHead className="text-right">Số đơn</TableHead>
            <TableHead className="text-right">Doanh thu</TableHead>
            <TableHead className="text-right">Giá vốn</TableHead>
            <TableHead className="text-right">Lợi nhuận gộp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.shift_id ?? 'none'}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">#{r.shift_id ?? '—'}</span>
                  {shiftStatusBadge(r.shift_status)}
                </div>
              </TableCell>
              <TableCell>{r.user_name ?? '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {r.opened_at != null ? formatDateTime(r.opened_at) : '—'}
                {r.closed_at != null && <> → {formatDateTime(r.closed_at)}</>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.order_count}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{formatVnd(r.revenue)}</TableCell>
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
