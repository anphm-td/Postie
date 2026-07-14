// ============================================================================
//  Postie POS - Edit product dialog (Products screen)
// ----------------------------------------------------------------------------
//  Edits an existing product's fields (name, barcode, cost, price). Stock is
//  NOT edited here — it is a derived column; use StockAdjustDialog instead.
//  Price/cost are entered in đồng (converted from cents on open, back to cents
//  on submit). Barcode is optional (empty → null).
// ============================================================================

import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
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

interface EditProductDialogProps {
  product: Product | null
  onClose: () => void
  onUpdated: () => void
}

function toNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function EditProductDialog({ product, onClose, onUpdated }: EditProductDialogProps) {
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [cost, setCost] = useState('0')
  const [price, setPrice] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from the product whenever it changes.
  useEffect(() => {
    if (product) {
      setName(product.name)
      setBarcode(product.barcode ?? '')
      setCost(String(Math.round(product.cost / 100)))
      setPrice(String(Math.round(product.price / 100)))
      setError(null)
      setSubmitting(false)
    }
  }, [product])

  if (!product) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Vui lòng nhập tên sản phẩm.')
      return
    }
    const priceCents = Math.round(toNumber(price) * 100)
    if (priceCents <= 0) {
      setError('Giá bán phải lớn hơn 0.')
      return
    }
    setSubmitting(true)
    try {
      await api.products.update(product!.id, {
        name: name.trim(),
        barcode: barcode.trim() || null,
        cost: Math.round(toNumber(cost) * 100),
        price: priceCents
      })
      onUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cập nhật sản phẩm.')
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa sản phẩm</DialogTitle>
          <DialogDescription>Sửa thông tin sản phẩm. Để thay đổi tồn kho, dùng "Nhập thêm hàng".</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Tên sản phẩm *</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-barcode">Mã vạch (tùy chọn)</Label>
            <Input
              id="edit-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Để trống nếu không có"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-cost">Giá gốc (₫)</Label>
              <Input id="edit-cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
              <p className="text-xs text-muted-foreground">{formatVnd(toNumber(cost) * 100)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">Giá bán (₫) *</Label>
              <Input id="edit-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              <p className="text-xs text-muted-foreground">{formatVnd(toNumber(price) * 100)}</p>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
