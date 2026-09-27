// ============================================================================
//  Postie POS - ShiftDetailDialog: chi tiết một ca (P0.4 — Lịch sử ca)
// ----------------------------------------------------------------------------
//  Hiển thị: thu/chi tiền trong ca (shift_cash_events) + dòng tiền dự kiến.
//    * Ca ĐANG MỞ : dự kiến nếu kết ca ngay = opening + cash_sales + thu − chi
//      (cash_sales lấy từ reports.revenueByPaymentMethod({shiftId}) — cùng
//      bộ lọc status IN (1,4) + pm.code='CASH' như shifts.ts:close).
//    * Ca ĐÃ ĐÓNG: expected_cash / counted_cash / difference đã chốt trong DB
//      (shifts có CHECK ràng buộc — chỉ đọc, không sửa).
// ============================================================================

import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@renderer/components/ui/table'
import type { ShiftCashEvent } from '@shared/types'
import type { ShiftWithUser } from '../reports/reportTypes'

interface ShiftDetailDialogProps {
  shift: ShiftWithUser | null
  onClose: () => void
  /** Mở dialog thu/chi cho ca này (chỉ hiện khi ca đang mở). */
  onAddCash?: (shift: ShiftWithUser) => void
}

function Row({
  label,
  value,
  mono,
  tone
}: {
  label: string
  value: string
  mono?: boolean
  tone?: 'default' | 'positive' | 'negative' | 'muted'
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-right font-medium text-foreground',
          mono && 'font-mono tabular-nums',
          tone === 'positive' && 'text-emerald-700',
          tone === 'negative' && 'text-destructive',
          tone === 'muted' && 'text-muted-foreground'
        )}
      >
        {value}
      </span>
    </div>
  )
}

export function ShiftDetailDialog({ shift, onClose, onAddCash }: ShiftDetailDialogProps) {
  const [events, setEvents] = useState<ShiftCashEvent[] | null>(null)
  const [totals, setTotals] = useState<{ cash_in: number; cash_out: number; net: number } | null>(null)
  const [cashSales, setCashSales] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!shift) {
      setEvents(null)
      setTotals(null)
      setCashSales(null)
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      api.shifts.listCashEvents(shift.id),
      api.shifts.getCashEventTotals(shift.id),
      api.reports.revenueByPaymentMethod({ shiftId: shift.id })
    ])
      .then(([ev, tot, byMethod]) => {
        if (cancelled) return
        setEvents(ev)
        setTotals(tot)
        setCashSales(byMethod.find((p) => p.code === 'CASH')?.total ?? 0)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Không tải được chi tiết ca.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [shift])

  if (!shift) return null

  const isOpen = shift.status === 0
  const cashIn = totals?.cash_in ?? 0
  const cashOut = totals?.cash_out ?? 0
  const projected = shift.opening_cash + (cashSales ?? 0) + cashIn - cashOut

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chi tiết ca #{shift.id}</DialogTitle>
          <DialogDescription>
            Dòng tiền ca làm việc và các lần thu/chi tiền mặt trong ca.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="space-y-2 rounded-xl bg-secondary p-4 text-sm">
              <Row label="Thu ngân" value={shift.user_name ?? '—'} />
              <Row label="Mở lúc" value={formatDateTime(shift.opened_at)} tone="muted" />
              {shift.closed_at != null && (
                <Row label="Kết thúc lúc" value={formatDateTime(shift.closed_at)} tone="muted" />
              )}
              <div className="my-1 border-t border-background/60" />
              <Row label="Tiền đầu ca" value={formatVnd(shift.opening_cash)} mono />
              <Row label="Doanh thu tiền mặt" value={formatVnd(cashSales ?? 0)} mono />
              <Row label="Thu trong ca" value={`+${formatVnd(cashIn)}`} mono tone="positive" />
              <Row label="Chi trong ca" value={`−${formatVnd(cashOut)}`} mono tone="negative" />
              {isOpen ? (
                <>
                  <div className="my-1 border-t border-background/60" />
                  <Row label="Dự kiến nếu kết ca bây giờ" value={formatVnd(projected)} mono />
                </>
              ) : (
                <>
                  <div className="my-1 border-t border-background/60" />
                  <Row label="Dự kiến trong két" value={formatVnd(shift.expected_cash ?? 0)} mono />
                  <Row label="Đếm được" value={formatVnd(shift.counted_cash ?? 0)} mono />
                </>
              )}
            </div>

            {!isOpen && shift.difference != null && (
              <div
                className={cn(
                  'flex items-baseline justify-between rounded-xl px-4 py-3',
                  shift.difference === 0 ? 'bg-emerald-500/10' : 'bg-destructive/10'
                )}
              >
                <span className="text-sm font-bold">Chênh lệch</span>
                <span
                  className={cn(
                    'font-mono text-lg font-bold tabular-nums',
                    shift.difference === 0 ? 'text-emerald-700' : 'text-destructive'
                  )}
                >
                  {shift.difference >= 0 ? '+' : ''}
                  {formatVnd(shift.difference)}
                </span>
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-medium">Lịch sử thu / chi trong ca</p>
              {events != null && events.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Ca này chưa có thu/chi nào.
                </p>
              ) : (
                <div className="max-h-56 overflow-auto rounded-xl border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead className="text-right">Số tiền</TableHead>
                        <TableHead>Ghi chú</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(events ?? []).map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {formatDateTime(ev.created_at)}
                          </TableCell>
                          <TableCell>
                            {ev.type === 0 ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700">Thu</Badge>
                            ) : (
                              <Badge variant="destructive">Chi</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {ev.type === 0 ? '+' : '−'}
                            {formatVnd(ev.amount)}
                          </TableCell>
                          <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                            {ev.note ?? '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {isOpen && onAddCash && (
            <Button variant="outline" onClick={() => onAddCash(shift)}>
              Thêm thu / chi
            </Button>
          )}
          <Button onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
