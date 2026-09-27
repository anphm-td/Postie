// ============================================================================
//  Postie POS - ShiftCashEventDialog: ghi THU/CHI tiền mặt trong ca (P0.4)
// ----------------------------------------------------------------------------
//  Gọi api.shifts.addCashEvent → shifts repo CHỈ cho ghi trên ca ĐANG MỞ
//  (sau kết ca, số liệu đối ca đã chốt). amount là INTEGER cents > 0 —
//  UI nhập đồng (MoneyInput) rồi quy đổi bằng dongToCents.
//  expected_cash = opening_cash + cash_sales + Σ(thu) − Σ(chi) — công thức
//  nằm ở shifts.ts:close, component này chỉ ghi dòng sự kiện.
// ============================================================================

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/context/AuthContext'
import { dongToCents } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { MoneyInput } from '@renderer/components/ui/money-input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import type { Shift, ShiftCashEventType } from '@shared/types'

interface ShiftCashEventDialogProps {
  shift: Shift | null
  onClose: () => void
  /** Gọi sau khi ghi thành công — parent reload danh sách ca/sự kiện. */
  onSaved: () => void
}

const typeButtonBase =
  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors'
const typeButtonIdle = 'bg-background hover:bg-accent'

export function ShiftCashEventDialog({ shift, onClose, onSaved }: ShiftCashEventDialogProps) {
  const { user } = useAuth()
  const [type, setType] = useState<ShiftCashEventType>(0)
  const [amountDong, setAmountDong] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (shift) {
      setType(0)
      setAmountDong('')
      setNote('')
      setError(null)
      setSubmitting(false)
    }
  }, [shift])

  if (!shift) return null

  const isOpenShift = shift.status === 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!shift) return
    setError(null)

    const cents = dongToCents(amountDong)
    if (cents <= 0) {
      setError('Nhập số tiền lớn hơn 0.')
      return
    }

    setSubmitting(true)
    try {
      await api.shifts.addCashEvent({
        shift_id: shift.id,
        type,
        amount: cents,
        note: note.trim() || undefined,
        created_by: user?.id ?? null
      })
      toast.success(type === 0 ? 'Đã ghi nhận thu tiền vào két.' : 'Đã ghi nhận chi tiền khỏi két.')
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không ghi được thu/chi tiền. Thử lại nhé.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
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
          <DialogTitle>Thu / chi tiền trong ca #{shift.id}</DialogTitle>
          <DialogDescription>
            Ghi nhận tiền vào/rút khỏi két ngoài doanh thu bán hàng (ví dụ nộp tiền về, mua gấp đồ
            dùng). Số này sẽ cộng/trừ vào két dự kiến khi kết ca.
          </DialogDescription>
        </DialogHeader>

        {!isOpenShift && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Ca này đã kết thúc — không thể ghi thêm thu/chi.
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType(0)}
              className={cn(
                typeButtonBase,
                type === 0
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700'
                  : `${typeButtonIdle} text-muted-foreground`
              )}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <TrendingUp className="h-4 w-4" />
                Thu tiền
              </span>
              <span className="text-xs opacity-80">Nhập thêm tiền vào két</span>
            </button>
            <button
              type="button"
              onClick={() => setType(1)}
              className={cn(
                typeButtonBase,
                type === 1
                  ? 'border-destructive bg-destructive/10 text-destructive'
                  : `${typeButtonIdle} text-muted-foreground`
              )}
            >
              <span className="flex items-center gap-1.5 font-medium">
                <TrendingDown className="h-4 w-4" />
                Chi tiền
              </span>
              <span className="text-xs opacity-80">Rút tiền khỏi két</span>
            </button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash-amount">Số tiền (₫)</Label>
            <MoneyInput
              id="cash-amount"
              value={amountDong}
              onValueChange={setAmountDong}
              placeholder="0"
              className="h-11 text-lg"
              autoFocus
              aria-label="Số tiền thu/chi"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cash-note">Ghi chú</Label>
            <Input
              id="cash-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: nộp tiền về công ty, mua túi nilon gấp…"
              maxLength={200}
            />
          </div>

          {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || !isOpenShift}>
              {submitting ? 'Đang ghi…' : type === 0 ? 'Ghi thu tiền' : 'Ghi chi tiền'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
