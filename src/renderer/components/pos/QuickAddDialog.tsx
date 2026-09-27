// ============================================================================
//  Thêm hàng nhanh TẠI MÀN BÁN (P0.2 — roadmap §4 "POS đa chế độ": "thêm
//  hàng mới ngay tại màn hình bán", hotkey F2). Mini form gọi thẳng
//  products:create; tồn đầu đầu qua products.create (repo tự xử lý).
// ============================================================================

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { parseDong } from '@renderer/lib/format'
import { useAuth } from '@renderer/context/AuthContext'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { MoneyInput } from '@renderer/components/ui/money-input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { Category, Product } from '@shared/types'

interface QuickAddDialogProps {
  open: boolean
  onClose: () => void
  /** Gọi sau khi tạo thành công; addToCart = trạng thái tick của người dùng. */
  onCreated: (product: Product, addToCart: boolean) => void
}

export function QuickAddDialog({ open, onClose, onCreated }: QuickAddDialogProps) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [priceDong, setPriceDong] = useState('')
  const [costDong, setCostDong] = useState('')
  const [unit, setUnit] = useState('')
  const [stockQty, setStockQty] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [addToCart, setAddToCart] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setBarcode('')
    setPriceDong('')
    setCostDong('')
    setUnit('')
    setStockQty('')
    setCategoryId('')
    setAddToCart(true)
    setError(null)
    setSubmitting(false)
    api.categories
      .list({ activeOnly: true })
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [open])

  async function handleSubmit() {
    setError(null)
    if (!name.trim()) {
      setError('Chưa nhập tên sản phẩm.')
      return
    }
    const priceCents = parseDong(priceDong) * 100
    if (priceCents <= 0) {
      setError('Giá bán phải lớn hơn 0.')
      return
    }
    setSubmitting(true)
    try {
      const product = await api.products.create({
        barcode: barcode.trim() || null,
        name: name.trim(),
        price: priceCents,
        cost: parseDong(costDong) * 100,
        unit: unit.trim() || null,
        stock: Math.max(0, parseInt(stockQty.replace(/\D/g, ''), 10) || 0),
        category_id: categoryId ? Number(categoryId) : null,
        created_by: user?.id // ghi dòng "Tồn đầu" vào thẻ kho (created_by NOT NULL)
      })
      toast.success(`Đã thêm sản phẩm "${product.name}"`)
      onCreated(product, addToCart)
      onClose()
    } catch (err) {
      //VD: trùng mã vạch (UNIQUE) — repo/SQLite trả message, hiển thị trực tiếp.
      setError(err instanceof Error ? err.message : 'Không tạo được sản phẩm.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Thêm hàng nhanh</DialogTitle>
          <DialogDescription>
            Tạo sản phẩm mới ngay tại màn bán hàng — phím tắt F2.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="qa-name">Tên sản phẩm *</Label>
            <Input
              id="qa-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Nước suối 500ml"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit()
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-barcode">Mã vạch</Label>
            <Input
              id="qa-barcode"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Quét hoặc nhập…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-category">Nhóm hàng</Label>
            <select
              id="qa-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">— Không nhóm —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-price">Giá bán (₫) *</Label>
            <MoneyInput
              id="qa-price"
              value={priceDong}
              onValueChange={setPriceDong}
              placeholder="0"
              aria-label="Giá bán"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-cost">Giá vốn (₫)</Label>
            <MoneyInput
              id="qa-cost"
              value={costDong}
              onValueChange={setCostDong}
              placeholder="0"
              aria-label="Giá vốn"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-unit">Đơn vị tính</Label>
            <Input
              id="qa-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="VD: chai, cái…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-stock">Tồn đầu</Label>
            <Input
              id="qa-stock"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              inputMode="numeric"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={addToCart}
            onChange={(e) => setAddToCart(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-[var(--primary,#16a34a)]"
          />
          Thêm sản phẩm vào giỏ sau khi tạo
        </label>

        {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Đang lưu…' : 'Tạo sản phẩm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
