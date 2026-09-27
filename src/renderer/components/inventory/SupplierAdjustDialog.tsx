import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { dongToCents, formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { MoneyInput } from '@renderer/components/ui/money-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { Supplier } from '@shared/types'

interface SupplierAdjustDialogProps {
  supplier: Supplier | null
  userId: number
  onClose: () => void
  onSaved: () => void
}

/**
 * ĐIỀU CHỈNH CÔNG NỢ NCC (suppliers:adjustBalance — type=2, signed, bắt buộc
 * lý do). Ghi sổ qua supplier_ledger — trigger tự cập nhật suppliers.balance,
 * tuyệt đối không UPDATE balance trực tiếp.
 */
export function SupplierAdjustDialog({ supplier, userId, onClose, onSaved }: SupplierAdjustDialogProps) {
  const [direction, setDirection] = useState<'increase' | 'decrease'>('increase')
  const [amountDong, setAmountDong] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const open = supplier !== null

  useEffect(() => {
    if (supplier) {
      setDirection('increase')
      setAmountDong('')
      setReason('')
    }
  }, [supplier])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplier) return
    const cents = dongToCents(amountDong)
    if (cents <= 0) {
      toast.error('Số tiền điều chỉnh phải lớn hơn 0.')
      return
    }
    if (!reason.trim()) {
      toast.error('Vui lòng nhập lý do điều chỉnh công nợ.')
      return
    }
    setSaving(true)
    try {
      await api.suppliers.adjustBalance({
        supplierId: supplier.id,
        amount: direction === 'increase' ? cents : -cents,
        userId,
        note: reason.trim()
      })
      toast.success('Đã ghi điều chỉnh công nợ.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không điều chỉnh được công nợ.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Điều chỉnh công nợ</DialogTitle>
          <DialogDescription>
            {supplier?.name} · Nợ hiện tại:{' '}
            <span className="font-mono font-semibold">
              {supplier?.balance != null ? formatVnd(supplier.balance) : '—'}
            </span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sup-adj-dir">Hướng điều chỉnh</Label>
            <select
              id="sup-adj-dir"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'increase' | 'decrease')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="increase">Tăng nợ (ghi nhận thêm khoản phải trả)</option>
              <option value="decrease">Giảm nợ (chiết khấu, bù trừ, sổ lại…)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-adj-amount">Số tiền (₫) *</Label>
            <MoneyInput
              id="sup-adj-amount"
              value={amountDong}
              onValueChange={setAmountDong}
              placeholder="0"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-adj-reason">Lý do *</Label>
            <Input
              id="sup-adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: chiết khấu 2% đợt nhập #12"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              Ghi điều chỉnh
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
