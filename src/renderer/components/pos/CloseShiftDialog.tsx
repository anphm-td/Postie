// ============================================================================
//  Postie POS - Close shift dialog (reconcile cash drawer)
// ----------------------------------------------------------------------------
//  Closes the active shift. The cashier counts the cash in the drawer and
//  enters it; api.shifts.close computes expected_cash (opening + cash sales
//  on this shift) and the difference. After closing, refreshShift() picks up
//  that there's no active shift and the app routes back to ShiftOpen.
// ============================================================================

import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import type { Shift } from '@shared/types'

interface CloseShiftDialogProps {
  shift: Shift | null
  userName: string
  onClose: () => void
  onClosed: () => Promise<void>
}

function toCents(dongStr: string): number {
  const dong = Number(dongStr.replace(/[^\d]/g, ''))
  return Number.isFinite(dong) && dong >= 0 ? Math.round(dong * 100) : 0
}

export function CloseShiftDialog({ shift, userName, onClose, onClosed }: CloseShiftDialogProps) {
  const [countedDong, setCountedDong] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Shift | null>(null)

  useEffect(() => {
    if (shift) {
      setCountedDong('')
      setError(null)
      setSubmitting(false)
      setResult(null)
    }
  }, [shift])

  if (!shift) return null

  const countedCents = toCents(countedDong)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const closed = await api.shifts.close(shift!.id, countedCents)
      setResult(closed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đóng ca.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFinish() {
    await onClosed() // refreshShift -> activeShift null -> routes to ShiftOpen
    onClose()
  }

  // Result screen after a successful close.
  if (result) {
    const diff = result.difference ?? 0
    const diffZero = diff === 0
    return (
      <Dialog open={shift !== null} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ca đã đóng</DialogTitle>
            <DialogDescription>Hóa đơn #{result.id}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <Row label="Nhân viên" value={userName} />
            <Row label="Mở lúc" value={formatDateTime(result.opened_at)} />
            <Row label="Đóng lúc" value={formatDateTime(result.closed_at!)} />
            <div className="my-2 border-t" />
            <Row label="Tiền đầu ca" value={formatVnd(result.opening_cash)} />
            <Row label="Dự kiến trong két" value={formatVnd(result.expected_cash!)} />
            <Row label="Đếm được" value={formatVnd(result.counted_cash!)} />
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <span>Chênh lệch</span>
              <span className={diffZero ? 'text-emerald-600' : diff < 0 ? 'text-destructive' : 'text-amber-600'}>
                {diff >= 0 ? '+' : ''}
                {formatVnd(diff)}
              </span>
            </div>
            {!diffZero && (
              <p className="text-xs text-muted-foreground">
                {diff < 0 ? 'Két thiếu tiền so với dự kiến.' : 'Két thừa tiền so với dự kiến.'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={handleFinish}>
              Xong
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={shift !== null}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đóng ca làm việc</DialogTitle>
          <DialogDescription>
            Đếm toàn bộ tiền mặt trong két sổ (bao gồm tiền đầu ca + doanh thu tiền mặt) và nhập số tiền thực đếm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <Row label="Nhân viên" value={userName} />
            <Row label="Mở lúc" value={formatDateTime(shift.opened_at)} />
            <Row label="Tiền đầu ca" value={formatVnd(shift.opening_cash)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="counted">Tiền mặt đếm được (₫)</Label>
            <Input
              id="counted"
              inputMode="numeric"
              value={countedDong}
              onChange={(e) => setCountedDong(e.target.value)}
              placeholder="0"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">{formatVnd(countedCents)}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang đóng ca…' : 'Đóng ca'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
