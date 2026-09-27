import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LogOut } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime, dongToCents } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { MoneyInput } from '@renderer/components/ui/money-input'
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-foreground ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </span>
    </div>
  )
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

  const countedCents = dongToCents(countedDong)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const closed = await api.shifts.close(shift!.id, countedCents)
      setResult(closed)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không đóng được ca. Thử lại nhé.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleFinish() {
    await onClosed()
    onClose()
  }

  if (result) {
    const diff = result.difference ?? 0
    const diffZero = diff === 0
    return (
      <Dialog open onOpenChange={() => {}}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Kết thúc ca #{result.id}</DialogTitle>
            <DialogDescription>
              {diffZero
                ? 'Két khớp với số dự kiến — chính xác tuyệt đối.'
                : diff < 0
                  ? 'Két thiếu tiền so với dự kiến — kiểm tra lại biên lai.'
                  : 'Két thừa tiền so với dự kiến — kiểm tra lại lần đếm.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-xl bg-secondary p-4 text-sm">
            <Row label="Nhân viên" value={userName} />
            <Row label="Mở lúc" value={formatDateTime(result.opened_at)} />
            <div className="my-1 border-t border-background/60" />
            <Row label="Tiền đầu ca" value={formatVnd(result.opening_cash)} mono />
            <Row label="Dự kiến trong két" value={formatVnd(result.expected_cash ?? 0)} mono />
            <Row label="Đếm được" value={formatVnd(result.counted_cash ?? 0)} mono />
          </div>
          <div
            className={`flex items-baseline justify-between rounded-xl px-4 py-3 ${
              diffZero ? 'bg-emerald-500/10' : 'bg-destructive/10'
            }`}
          >
            <span className="text-sm font-bold">Chênh lệch</span>
            <span
              className={`font-mono text-xl font-bold tabular-nums ${
                diffZero ? 'text-emerald-700' : 'text-destructive'
              }`}
            >
              {diff >= 0 ? '+' : ''}
              {formatVnd(diff)}
            </span>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={handleFinish}>
              <LogOut className="mr-1 h-4 w-4" />
              Xong, về màn mở ca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đóng ca làm việc</DialogTitle>
          <DialogDescription>
            Đếm toàn bộ tiền mặt trong két (gồm tiền đầu ca + doanh thu tiền mặt) rồi nhập số thực
            đếm.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2 rounded-xl bg-secondary p-4 text-sm">
            <Row label="Nhân viên" value={userName} />
            <Row label="Mở lúc" value={formatDateTime(shift.opened_at)} />
            <Row label="Tiền đầu ca" value={formatVnd(shift.opening_cash)} mono />
          </div>
          <div className="space-y-2">
            <Label htmlFor="counted">Tiền mặt đếm được (₫)</Label>
            <MoneyInput
              id="counted"
              value={countedDong}
              onValueChange={setCountedDong}
              placeholder="0"
              className="h-11 text-lg"
              autoFocus
              aria-label="Tiền mặt đếm được"
            />
          </div>
          {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
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
