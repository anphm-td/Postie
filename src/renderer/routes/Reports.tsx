// ============================================================================
//  Postie POS - Reports screen (revenue summary)
// ----------------------------------------------------------------------------
//  Summarizes sales: choose "this shift" (orders on the active shift) or
//  "50 most recent" orders. Shows summary cards (order count, total revenue,
//  collected, outstanding) computed client-side from order headers, plus a
//  table of the orders. Payments detail isn't needed — paid_amount on the
//  header is enough for collected/outstanding.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@renderer/components/ui/table'
import type { Order, OrderStatus } from '@shared/types'

type Filter = 'shift' | 'recent'

const STATUS_LABEL: Record<OrderStatus, string> = {
  0: 'Chờ',
  1: 'Đã thanh toán',
  2: 'Đã hủy',
  3: 'Hoàn tiền',
  4: 'Thanh toán một phần'
}

function statusVariant(s: OrderStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 1) return 'default'
  if (s === 2) return 'destructive'
  if (s === 4) return 'secondary'
  return 'outline'
}

export function Reports() {
  const { activeShift } = useAuth()
  const [filter, setFilter] = useState<Filter>('shift')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (filter === 'shift' && activeShift) {
        setOrders(await api.orders.listByShift(activeShift.id))
      } else {
        setOrders(await api.orders.listRecent(50))
      }
    } finally {
      setLoading(false)
    }
  }, [filter, activeShift])

  useEffect(() => {
    load()
  }, [load])

  // If no active shift and the user is on "this shift", fall back to recent.
  const effectiveFilter: Filter = filter === 'shift' && !activeShift ? 'recent' : filter

  const count = orders.length
  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const collected = orders.reduce((s, o) => s + o.paid_amount, 0)
  const outstanding = Math.max(0, totalRevenue - collected)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-2xl font-semibold">Báo cáo doanh thu</h1>
        <div className="flex gap-1 rounded-md border p-1">
          <button
            className={`rounded px-3 py-1 text-sm transition-colors ${
              effectiveFilter === 'shift' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
            onClick={() => setFilter('shift')}
            disabled={!activeShift}
            title={activeShift ? undefined : 'Chưa có ca đang mở'}
          >
            Ca hiện tại
          </button>
          <button
            className={`rounded px-3 py-1 text-sm transition-colors ${
              effectiveFilter === 'recent' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
            onClick={() => setFilter('recent')}
          >
            50 đơn gần nhất
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard label="Số đơn" value={String(count)} />
          <SummaryCard label="Tổng doanh thu" value={formatVnd(totalRevenue)} />
          <SummaryCard label="Đã thu" value={formatVnd(collected)} />
          <SummaryCard
            label="Còn nợ"
            value={formatVnd(outstanding)}
            highlight={outstanding > 0}
          />
        </div>

        {/* Orders table */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hóa đơn</TableHead>
                <TableHead>Thời gian</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
                <TableHead className="text-right">Đã thu</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Đang tải…
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Chưa có đơn hàng nào.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">#{o.invoice_no}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatVnd(o.total)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatVnd(o.paid_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(o.status)}>{STATUS_LABEL[o.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className={`mt-1 text-xl font-bold ${highlight ? 'text-destructive' : ''}`}>{value}</div>
      </CardContent>
    </Card>
  )
}
