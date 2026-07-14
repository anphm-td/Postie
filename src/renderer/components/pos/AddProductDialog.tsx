// ============================================================================
//  Postie POS - Add product dialog (Products screen)
// ----------------------------------------------------------------------------
//  Form to create a product with the fields requested: name, optional barcode,
//  stock quantity, cost (giá gốc), and selling price (giá bán). Price and cost
//  are entered in đồng for friendliness and converted to cents (×100) on
//  submit, with a live formatVnd preview. Barcode is optional — an empty value
//  is sent as null (the schema allows multiple NULL barcodes).
// ============================================================================

import { useState } from 'react'
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

interface AddProductDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function toNumber(raw: string): number {
  const n = Number(raw.replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function AddProductDialog({ open, onClose, onCreated }: AddProductDialogProps) {
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [stock, setStock] = useState('0')
  const [cost, setCost] = useState('0')
  const [price, setPrice] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setBarcode('')
    setStock('0')
    setCost('0')
    setPrice('0')
    setError(null)
    setSubmitting(false)
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Vui lòng nhập tên sản phẩm.')
      return
    }
    const priceCents = Math.round(toNumber(price) * 100)
    const costCents = Math.round(toNumber(cost) * 100)
    const stockNum = toNumber(stock)
    if (priceCents <= 0) {
      setError('Giá bán phải lớn hơn 0.')
      return
    }
    setSubmitting(true)
    try {
      await api.products.create({
        name: name.trim(),
        barcode: barcode.trim() || null,
        stock: stockNum,
        cost: costCents,
        price: priceCents
      })
      reset()
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể thêm sản phẩm.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm sản phẩm</DialogTitle>
          <DialogDescription>Nhập thông tin sản phẩm mới. Mã vạch để trống nếu không có.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tên sản phẩm *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Cà phê đen"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="barcode">Mã vạch (tùy chọn)</Label>
            <Input
              id="barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Quét hoặc nhập mã vạch"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="stock">Số lượng hàng tồn</Label>
            <Input
              id="stock"
              inputMode="numeric"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cost">Giá gốc (₫)</Label>
              <Input id="cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
              <p className="text-xs text-muted-foreground">{formatVnd(toNumber(cost) * 100)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Giá bán (₫) *</Label>
              <Input id="price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
              <p className="text-xs text-muted-foreground">{formatVnd(toNumber(price) * 100)}</p>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu…' : 'Thêm sản phẩm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
