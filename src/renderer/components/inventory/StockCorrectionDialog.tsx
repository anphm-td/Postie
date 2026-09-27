import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import type { Product } from '@shared/types'

export type StockCorrectionMode = 'adjust' | 'wastage'

interface StockCorrectionDialogProps {
  product: Product | null
  /** 'adjust' = điều chỉnh tồn (+/−, type=3) · 'wastage' = hao hụt (−, type=4). */
  mode: StockCorrectionMode
  userId: number
  onClose: () => void
  onUpdated: () => void
}

/**
 * ĐIỀU CHỈNH TỒN & HAO HỤT thủ công cho 1 sản phẩm (P1.3/P1.8):
 *  - adjust → products:manualAdjust (delta signed, bắt buộc lý do, type=3)
 *  - wastage → products:wastage (qty > 0, delta âm, type=4)
 * Cả hai đều INSERT stock_movements — trigger trg_stock_after_insert tự đồng
 * bộ products.stock; tuyệt đối không UPDATE stock trực tiếp.
 */
export function StockCorrectionDialog({
  product,
  mode,
  userId,
  onClose,
  onUpdated
}: StockCorrectionDialogProps) {
  const [qtyRaw, setQtyRaw] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const open = product !== null

  useEffect(() => {
    if (open) {
      setQtyRaw('')
      setReason('')
    }
  }, [open, product?.id, mode])

  const parsedQty = Number(qtyRaw.trim())
  const qtyValid =
    mode === 'wastage'
      ? Number.isInteger(parsedQty) && parsedQty > 0
      : /^-?\d+$/.test(qtyRaw.trim()) && parsedQty !== 0
  const resulting = product ? (mode === 'wastage' ? product.stock - (qtyValid ? parsedQty : 0) : product.stock + (qtyValid ? parsedQty : 0)) : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!product || !userId) return
    if (!qtyValid) {
      toast.error(mode === 'wastage' ? 'Số lượng hao hụt phải là số nguyên dương.' : 'Số điều chỉnh phải là số nguyên khác 0 (dùng dấu − để bớt).')
      return
    }
    const note = reason.trim()
    if (mode === 'adjust' && !note) {
      toast.error('Vui lòng nhập lý do điều chỉnh tồn kho.')
      return
    }
    setSubmitting(true)
    try {
      const updated =
        mode === 'wastage'
          ? await api.products.wastage({ productId: product.id, qty: parsedQty, userId, note: note || undefined })
          : await api.products.manualAdjust({ productId: product.id, delta: parsedQty, userId, note })
      toast.success(`Đã ghi sổ tồn kho. Tồn mới của "${updated.name}": ${updated.stock}`)
      onUpdated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không ghi được biến động tồn kho.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'wastage' ? 'Ghi nhận hao hụt' : 'Điều chỉnh tồn kho'}</DialogTitle>
          <DialogDescription>
            {product?.name} · Tồn hiện tại: <span className="font-mono font-semibold">{product?.stock}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sc-qty">
              {mode === 'wastage' ? 'Số lượng hao hụt *' : 'Số điều chỉnh (+ thêm / − bớt) *'}
            </Label>
            <Input
              id="sc-qty"
              value={qtyRaw}
              onChange={(e) => setQtyRaw(e.target.value.replace(mode === 'wastage' ? /[^\d]/g : /[^-\d]/g, ''))}
              placeholder={mode === 'wastage' ? 'VD: 2' : 'VD: 3 hoặc -2'}
              inputMode="numeric"
              autoFocus
            />
            <p className={cn('text-xs', resulting < 0 ? 'text-destructive' : 'text-muted-foreground')}>
              Tồn sau ghi sổ: <span className="font-mono font-semibold">{resulting}</span>
              {resulting < 0 && ' — kho không thể âm, hệ thống sẽ từ chối.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-reason">
              {mode === 'wastage' ? 'Ghi chú (tùy chọn)' : 'Lý do điều chỉnh *'}
            </Label>
            <Input
              id="sc-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === 'wastage' ? 'VD: vỡ chai, hết hạn…' : 'VD: đối soát quầy, hàng khách trả không nhập lại…'
              }
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {mode === 'wastage' ? 'Ghi hao hụt' : 'Ghi điều chỉnh'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
