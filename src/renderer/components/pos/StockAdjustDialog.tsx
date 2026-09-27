import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PackagePlus } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { parseDong } from '@renderer/lib/format'
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
import type { Product } from '@shared/types'

interface StockAdjustDialogProps {
  product: Product | null
  userId: number
  onClose: () => void
  onUpdated: () => void
}

export function StockAdjustDialog({ product, userId, onClose, onUpdated }: StockAdjustDialogProps) {
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (product) {
      setQty('1')
      setNote('')
      setError(null)
      setSubmitting(false)
    }
  }, [product])

  if (!product) return null

  const addQty = parseDong(qty)
  const newStock = product.stock + addQty

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (addQty <= 0) {
      setError('Số lượng nhập phải lớn hơn 0.')
      return
    }
    setSubmitting(true)
    try {
      // manualAdjust (type=3 điều chỉnh) — KHÔNG dùng type=2 (nhập theo phiếu):
      // purchases.getReceivedLines suy ra số đã nhận của phiếu nhập từ
      // stock_movements type=2 AND note='PO#<id>', ghi type=2 với note tự do
      // (vd "PO#1") sẽ nhiễm hạn ngạch nhận hàng của phiếu đó.
      await api.products.manualAdjust({
        productId: product!.id,
        delta: addQty,
        userId,
        note: note.trim() || `Nhập thêm ${addQty}`
      })
      toast.success(`Đã nhập thêm ${addQty} ${product!.name}`)
      onUpdated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không cập nhật được tồn kho. Thử lại nhé.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-emerald-700" />
            Nhập thêm hàng
          </DialogTitle>
          <DialogDescription>
            {product!.name} — đang tồn{' '}
            <b className="font-mono text-foreground">{product!.stock}</b>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">Số lượng nhập thêm</Label>
            <Input
              id="qty"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ''))}
              className="h-11 font-mono text-lg"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Tồn sau khi nhập: <b className="font-mono text-foreground">{newStock}</b>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú (tùy chọn)</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Nhập từ nhà cung cấp A"
            />
          </div>
          {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu…' : 'Nhập hàng'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
