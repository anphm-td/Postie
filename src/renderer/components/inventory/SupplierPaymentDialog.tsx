import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Banknote } from 'lucide-react'
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
import type { PurchaseOrder, Supplier } from '@shared/types'

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface SupplierPaymentDialogProps {
  /** NCC nhận tiền — chấp nhận object rút gọn {id, name, balance?} từ phiếu nhập. */
  supplier: (Pick<Supplier, 'id' | 'name'> & Partial<Pick<Supplier, 'balance'>>) | null
  /** Phiếu nhập cần đối chiếu thanh toán (tùy chọn — cập nhật purchase_orders.paid). */
  poId?: number | null
  userId: number
  onClose: () => void
  onSaved: () => void
}

/**
 * TRẢ TIỀN NCC (P1.2 — suppliers:recordPayment): INSERT supplier_ledger
 * type=1 (âm) — trigger tự giảm suppliers.balance; nếu kèm poId thì tiền
 * được đối chiếu vào purchase_orders.paid của phiếu đó.
 */
export function SupplierPaymentDialog({
  supplier,
  poId,
  userId,
  onClose,
  onSaved
}: SupplierPaymentDialogProps) {
  const [amountDong, setAmountDong] = useState('')
  const [note, setNote] = useState('')
  const [selectedPo, setSelectedPo] = useState('')
  const [openPos, setOpenPos] = useState<PurchaseOrder[]>([])
  const [saving, setSaving] = useState(false)
  const open = supplier !== null

  useEffect(() => {
    if (supplier) {
      setAmountDong('')
      setNote('')
      setSelectedPo(poId != null ? String(poId) : '')
      void api.purchases
        .list({ supplier_id: supplier.id, status: 0, limit: 100 })
        .then((pos) => setOpenPos(pos.filter((p) => p.total - p.paid > 0)))
    }
  }, [supplier, poId])

  const amountCents = dongToCents(amountDong)
  const remaining = selectedPo
    ? (openPos.find((p) => p.id === Number(selectedPo))?.total ?? 0) -
      (openPos.find((p) => p.id === Number(selectedPo))?.paid ?? 0)
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplier) return
    if (amountCents <= 0) {
      toast.error('Số tiền trả phải lớn hơn 0.')
      return
    }
    setSaving(true)
    try {
      await api.suppliers.recordPayment({
        supplierId: supplier.id,
        amount: amountCents,
        userId,
        note: note.trim() || null,
        poId: selectedPo ? Number(selectedPo) : null
      })
      toast.success(`Đã ghi nhận trả NCC ${formatVnd(amountCents)}.`)
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không ghi được khoản trả NCC.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-600" />
            Trả tiền nhà cung cấp
          </DialogTitle>
          <DialogDescription>
            {supplier?.name}
            {supplier?.balance != null && (
              <>
                {' '}
                · Công nợ hiện tại:{' '}
                <span className="font-mono font-semibold">{formatVnd(Math.max(0, supplier.balance))}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sup-pay-amount">Số tiền trả (₫) *</Label>
            <MoneyInput
              id="sup-pay-amount"
              value={amountDong}
              onValueChange={setAmountDong}
              placeholder="0"
              autoFocus
            />
            {remaining != null && remaining > 0 && (
              <p className="text-xs text-muted-foreground">
                Phiếu #{selectedPo} còn nợ {formatVnd(remaining)}.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-pay-po">Đối chiếu phiếu nhập (tùy chọn)</Label>
            <select
              id="sup-pay-po"
              value={selectedPo}
              onChange={(e) => setSelectedPo(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">— Không đối chiếu —</option>
              {openPos.map((p) => (
                <option key={p.id} value={p.id}>
                  Phiếu #{p.id} — còn {formatVnd(p.total - p.paid)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-pay-note">Ghi chú</Label>
            <Input
              id="sup-pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: trả tiền đợt nhập 10/9"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              Xác nhận trả tiền
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
