// ============================================================================
//  Postie POS - Products screen
// ----------------------------------------------------------------------------
//  Lists products in a table (name, barcode, date added, stock, cost, price,
//  actions) with a search box (name or barcode) and an "Add product" button.
//  Each row has actions: edit (name/barcode/cost/price), receive stock
//  (stock_movements), and deactivate (soft-delete). Low-stock products are
//  flagged with a badge. Prices are shown via formatVnd; date added comes from
//  products.created_at (unix seconds, auto-set by SQLite on insert).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Search, Pencil, PackagePlus, Trash2 } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@renderer/components/ui/table'
import { AddProductDialog } from '@renderer/components/pos/AddProductDialog'
import { EditProductDialog } from '@renderer/components/pos/EditProductDialog'
import { StockAdjustDialog } from '@renderer/components/pos/StockAdjustDialog'
import type { Product } from '@shared/types'

// TODO: consider moving this to '@renderer/lib/format' alongside formatVnd
// so every screen formats dates the same way.
function formatDateVn(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

export function Products() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [stockTarget, setStockTarget] = useState<Product | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async (search: string) => {
    setLoading(true)
    try {
      const res = await api.products.list({ search: search || undefined, pageSize: 200 })
      setProducts(res.items)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => load(query.trim()), 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, load])

  async function handleDeactivate(p: Product) {
    if (!window.confirm(`Xóa (vô hiệu hóa) sản phẩm "${p.name}"? Sản phẩm sẽ ẩn khỏi màn bán hàng nhưng lịch sử đơn hàng được giữ.`)) return
    setBusyId(p.id)
    try {
      await api.products.deactivate(p.id)
      await load(query.trim())
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Không thể xóa sản phẩm.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-2xl font-semibold">Kho hàng</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Thêm sản phẩm
        </Button>
      </div>

      <div className="border-b px-6 py-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc mã vạch…"
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-muted-foreground">Đang tải…</div>
        ) : products.length === 0 ? (
          <div className="text-muted-foreground">Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để tạo.</div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên sản phẩm</TableHead>
                  <TableHead>Mã vạch</TableHead>
                  <TableHead>Ngày nhập</TableHead>
                  <TableHead className="text-right">Tồn kho</TableHead>
                  <TableHead className="text-right">Giá gốc</TableHead>
                  <TableHead className="text-right">Giá bán</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => {
                  const out = p.stock <= 0
                  const low = !out && p.low_stock_alert > 0 && p.stock <= p.low_stock_alert
                  const disabled = busyId === p.id
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.barcode || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDateVn(p.created_at)}</TableCell>
                      <TableCell className="text-right">
                        {out ? (
                          <Badge variant="destructive">Hết hàng</Badge>
                        ) : low ? (
                          <Badge variant="secondary">còn {p.stock}</Badge>
                        ) : (
                          <span>{p.stock}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatVnd(p.cost)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatVnd(p.price)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditTarget(p)}
                            disabled={disabled}
                            title="Chỉnh sửa"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                            onClick={() => setStockTarget(p)}
                            disabled={disabled}
                            title="Nhập thêm hàng"
                          >
                            <PackagePlus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeactivate(p)}
                            disabled={disabled}
                            title="Xóa (vô hiệu hóa)"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AddProductDialog open={showAdd} onClose={() => setShowAdd(false)} onCreated={() => load(query.trim())} />
      <EditProductDialog
        product={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={() => load(query.trim())}
      />
      <StockAdjustDialog
        product={stockTarget}
        userId={user?.id ?? 0}
        onClose={() => setStockTarget(null)}
        onUpdated={() => load(query.trim())}
      />
    </div>
  )
}
