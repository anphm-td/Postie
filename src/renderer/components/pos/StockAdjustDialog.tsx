// ============================================================================
//  Postie POS - Stock adjust dialog (Products screen)
// ----------------------------------------------------------------------------
//  Adds units to a product's stock (receiving inventory). Uses the stock-
//  movements path (type=2 purchase) so the trigger syncs products.stock and
//  the audit trail is preserved. Shows the current stock and a live preview
//  of the resulting stock after the change.
// ============================================================================

import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
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

function toNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
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

  const addQty = toNumber(qty)
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
      await api.products.adjustStock({
        productId: product!.id,
        delta: addQty,
        type: 2, // purchase / receiving
        note: note.trim() || `Nhập thêm ${addQty}`,
        userId
      })
      onUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật tồn kho.')
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
          <DialogTitle>Nhập thêm hàng</DialogTitle>
          <DialogDescription>
            {product!.name} — đang tồn <b className="text-foreground">{product!.stock}</b>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="qty">Số lượng nhập thêm</Label>
            <Input
              id="qty"
              inputMode="numeric"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Tồn sau khi nhập: <b className="text-foreground">{newStock}</b>
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
          {error && <p className="text-sm text-destructive">{error}</p>}
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
