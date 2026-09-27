import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { HandCoins } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatVnd, parseDong } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { MoneyInput } from '@renderer/components/ui/money-input'
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
import type { Customer } from '@shared/types'

interface RecordPaymentDialogProps {
  customer: Customer | null
  userId: number
  onClose: () => void
  onUpdated: () => void
}

export function RecordPaymentDialog({ customer, userId, onClose, onUpdated }: RecordPaymentDialogProps) {
  const [amountDong, setAmountDong] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (customer) {
      setAmountDong('')
      setNote('')
      setError(null)
      setSubmitting(false)
    }
  }, [customer])

  if (!customer) return null

  const paidCents = parseDong(amountDong) * 100
  const remainingCents = customer.balance - paidCents
  const overpaid = paidCents > customer.balance

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) return
    setError(null)
    if (paidCents <= 0) {
      setError('Số tiền thu phải lớn hơn 0.')
      return
    }
    setSubmitting(true)
    try {
      await api.customers.recordPayment(customer.id, paidCents, userId, note.trim() || undefined)
      toast.success(`Đã thu ${formatVnd(paidCents)} từ ${customer.name}`)
      onUpdated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không ghi nhận được khoản thu. Thử lại nhé.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={customer !== null}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-emerald-700" />
            Thu nợ
          </DialogTitle>
          <DialogDescription>
            {customer.name} — dư nợ hiện tại{' '}
            <b
              className={`font-mono tabular-nums ${
                customer.balance > 0 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {formatVnd(customer.balance)}
            </b>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="pay-amount">Số tiền thu (₫)</Label>
              {customer.balance > 0 && (
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setAmountDong(String(Math.floor(customer.balance / 100)))}
                >
                  Thu toàn bộ
                </button>
              )}
            </div>
            <MoneyInput
              id="pay-amount"
              value={amountDong}
              onValueChange={setAmountDong}
              placeholder="0"
              className="h-11 text-lg"
              autoFocus
              aria-label="Số tiền thu"
            />
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Còn lại sau khi thu</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    remainingCents > 0 ? 'text-destructive' : 'text-emerald-700'
                  }`}
                >
                  {formatVnd(Math.abs(remainingCents))}
                  {remainingCents < 0 && ' (cửa hàng nợ lại khách)'}
                </span>
              </div>
            </div>
            {overpaid && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800">
                Khách trả vượt dư nợ — phần thừa ghi là cửa hàng nợ lại khách.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">Ghi chú (tùy chọn)</Label>
            <Input
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Thu nợ đợt 1"
            />
          </div>
          {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || paidCents <= 0}>
              {submitting ? 'Đang lưu…' : 'Xác nhận thu nợ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
