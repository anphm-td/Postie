import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Scale } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatVnd, parseDong } from '@renderer/lib/format'
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
import type { Customer } from '@shared/types'

interface AdjustDebtDialogProps {
  customer: Customer | null
  userId: number
  onClose: () => void
  onUpdated: () => void
}

function toSignedDong(raw: string): number {
  const m = raw.replace(/\s/g, '').match(/^(-?)([\d.]*)$/)
  if (!m) return 0
  const digits = m[2].replace(/\./g, '')
  const n = Number(digits)
  if (!Number.isFinite(n) || n === 0) return 0
  return m[1] ? -Math.floor(n) : Math.floor(n)
}

export function AdjustDebtDialog({ customer, userId, onClose, onUpdated }: AdjustDebtDialogProps) {
  const [amountRaw, setAmountRaw] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (customer) {
      setAmountRaw('')
      setNote('')
      setError(null)
      setSubmitting(false)
    }
  }, [customer])

  if (!customer) return null

  const amountDong = toSignedDong(amountRaw)
  const newBalanceCents = customer.balance + amountDong * 100

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) return
    setError(null)
    if (amountDong === 0) {
      setError('Nhập số điều chỉnh khác 0 — thêm dấu trừ phía trước để giảm nợ.')
      return
    }
    if (!note.trim()) {
      setError('Vui lòng nhập lý do điều chỉnh.')
      return
    }
    setSubmitting(true)
    try {
      await api.customers.adjustBalance({
        customerId: customer.id,
        amount: amountDong * 100,
        userId,
        note: note.trim()
      })
      toast.success(
        `Đã điều chỉnh công nợ ${customer.name} ${amountDong > 0 ? '+' : ''}${formatVnd(Math.abs(amountDong) * 100)}`
      )
      onUpdated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không điều chỉnh được công nợ. Thử lại nhé.'
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
            <Scale className="h-5 w-5 text-amber-600" />
            Điều chỉnh công nợ
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
            <Label htmlFor="adj-amount">Số điều chỉnh (₫)</Label>
            <Input
              id="adj-amount"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              placeholder="VD: -50000 hoặc 20000"
              className="h-11 font-mono text-lg"
              autoFocus
            />
            <div className="flex flex-wrap gap-1.5">
              {[10000, 50000].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAmountRaw(String(d))}
                  className="rounded-md border bg-background px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  +{d / 1000}k
                </button>
              ))}
              {[10000, 50000].map((d) => (
                <button
                  key={`-${d}`}
                  type="button"
                  onClick={() => setAmountRaw(String(-d))}
                  className="rounded-md border bg-background px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                >
                  −{d / 1000}k
                </button>
              ))}
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dư nợ sau điều chỉnh</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    newBalanceCents > 0 ? 'text-destructive' : 'text-emerald-700'
                  }`}
                >
                  {formatVnd(newBalanceCents)}
                </span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adj-note">Lý do *</Label>
            <Input
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Xóa nợ cũ không đòi được"
            />
          </div>
          {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting || amountDong === 0}>
              {submitting ? 'Đang lưu…' : 'Xác nhận điều chỉnh'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
