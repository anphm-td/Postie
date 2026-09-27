import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { Category, Product, Supplier } from '@shared/types'

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface ProductAssignmentDialogProps {
  product: Product | null
  onClose: () => void
  onUpdated: () => void
}

/**
 * Gán NHÓM HÀNG + NHÀ CUNG CẤP cho một sản phẩm (P0.7/P1.2):
 * AddProductDialog/EditProductDialog (components/pos) chưa có ô chọn nhóm/NCC,
 * nên bổ sung gán qua products:update (category_id, supplier_id là cột tham
 * chiếu thường — không phải cột dẫn xuất).
 */
export function ProductAssignmentDialog({ product, onClose, onUpdated }: ProductAssignmentDialogProps) {
  const [categories, setCategories] = useState<Category[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [saving, setSaving] = useState(false)

  const open = product !== null

  useEffect(() => {
    if (!open) return
    void api.categories.list({ activeOnly: true }).then(setCategories)
    void api.suppliers.list({ activeOnly: true, pageSize: 200 }).then((res) => setSuppliers(res.items))
  }, [open])

  useEffect(() => {
    if (product) {
      setCategoryId(product.category_id != null ? String(product.category_id) : '')
      setSupplierId(product.supplier_id != null ? String(product.supplier_id) : '')
    }
  }, [product])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!product) return
    setSaving(true)
    try {
      await api.products.update(product.id, {
        category_id: categoryId ? Number(categoryId) : null,
        supplier_id: supplierId ? Number(supplierId) : null
      })
      toast.success(`Đã cập nhật phân loại cho "${product.name}".`)
      onUpdated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không cập nhật được phân loại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Phân loại sản phẩm</DialogTitle>
          <DialogDescription>{product?.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="assign-category">Nhóm hàng</Label>
            <select
              id="assign-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">— Không nhóm —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id != null ? '↳ ' : ''}
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assign-supplier">Nhà cung cấp</Label>
            <select
              id="assign-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">— Chưa chọn —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              Lưu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
