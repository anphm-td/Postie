import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { formatVnd, dongToCents, parseDong } from '@renderer/lib/format'
import { useAuth } from '@renderer/context/AuthContext'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { MoneyInput } from '@renderer/components/ui/money-input'
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

export function AddProductDialog({ open, onClose, onCreated }: AddProductDialogProps) {
  const { user } = useAuth()
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
    const priceCents = dongToCents(price)
    if (priceCents <= 0) {
      setError('Giá bán phải lớn hơn 0.')
      return
    }
    setSubmitting(true)
    try {
      await api.products.create({
        name: name.trim(),
        barcode: barcode.trim() || null,
        stock: parseDong(stock),
        cost: dongToCents(cost),
        price: priceCents,
        created_by: user?.id // ghi dòng "Tồn đầu" vào thẻ kho (created_by NOT NULL)
      })
      toast.success(`Đã thêm ${name.trim()}`)
      reset()
      onCreated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không thêm được sản phẩm. Thử lại nhé.'
      setError(msg)
      toast.error(msg)
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
          <DialogDescription>
            Nhập thông tin sản phẩm mới. Mã vạch để trống nếu không có.
          </DialogDescription>
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
              onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ''))}
              className="font-mono"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cost">Giá gốc (₫)</Label>
              <MoneyInput id="cost" value={cost} onValueChange={setCost} />
              <p className="text-xs text-muted-foreground">{formatVnd(parseDong(cost) * 100)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Giá bán (₫) *</Label>
              <MoneyInput id="price" value={price} onValueChange={setPrice} />
              <p className="text-xs text-muted-foreground">{formatVnd(parseDong(price) * 100)}</p>
            </div>
          </div>
          {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
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
