import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  FileSpreadsheet,
  History,
  Package,
  PackageOpen,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  Scale,
  Search,
  Tags,
  Trash2,
  Truck,
} from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDate } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { AddProductDialog } from '@renderer/components/pos/AddProductDialog'
import { ImportExcelDialog } from '@renderer/components/pos/ImportExcelDialog'
import { EditProductDialog } from '@renderer/components/pos/EditProductDialog'
import { StockAdjustDialog } from '@renderer/components/pos/StockAdjustDialog'
import { LowStockBanner, type StockFilterMode } from '@renderer/components/inventory/LowStockBanner'
import { CategoryManager } from '@renderer/components/inventory/CategoryManager'
import { SupplierSection } from '@renderer/components/inventory/SupplierSection'
import { ProductAssignmentDialog } from '@renderer/components/inventory/ProductAssignmentDialog'
import {
  StockCorrectionDialog,
  type StockCorrectionMode
} from '@renderer/components/inventory/StockCorrectionDialog'
import { StockMovementsDialog } from '@renderer/components/inventory/StockMovementsDialog'
import {
  BarcodePrintDialog,
  type BarcodePrintItem
} from '@renderer/components/inventory/BarcodePrintDialog'
import type { Category, Product } from '@shared/types'

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

type Tab = 'products' | 'categories' | 'suppliers'

/**
 * KHO HÀNG (P0.7 + P1) — 3 tab:
 *  - Sản phẩm: tìm kiếm/lọc nhóm + CẢNH BÁO TỒN THẤP nổi bật (banner), chọn
 *    nhiều để in tem mã vạch 40x20mm (JsBarcode), điều chỉnh tồn / hao hụt,
 *    thẻ kho (stock_movements), gán nhóm + NCC.
 *  - Danh mục: CRUD nhóm hàng phân cấp (categories).
 *  - Nhà cung cấp: CRUD + công nợ phải trả (supplier_ledger).
 * Tồn kho là cột dẫn xuất — mọi thay đổi qua stock_movements (dialog riêng).
 */
export function Products() {
  const { user } = useAuth()
  const userId = user?.id ?? 0

  const [tab, setTab] = useState<Tab>('products')

  // ===== Dữ liệu =====
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [report, setReport] = useState<Awaited<
    ReturnType<typeof api.products.getStockReport>
  > | null>(null)
  const [query, setQuery] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilterMode>('all')
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [busyId, setBusyId] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ===== Dialog targets =====
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editTarget, setEditTarget] = useState<Product | null>(null)
  const [restockTarget, setRestockTarget] = useState<Product | null>(null)
  const [correctionTarget, setCorrectionTarget] = useState<
    { product: Product; mode: StockCorrectionMode } | null
  >(null)
  const [movementsTarget, setMovementsTarget] = useState<Product | null>(null)
  const [assignmentTarget, setAssignmentTarget] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [printItems, setPrintItems] = useState<BarcodePrintItem[] | null>(null)

  const loadCategories = useCallback(async () => {
    setCategories(await api.categories.list({ activeOnly: true }))
  }, [])

  const load = useCallback(
    async (search: string, catId: string) => {
      setLoading(true)
      try {
        const [list, rep] = await Promise.all([
          api.products.list({
            search: search || undefined,
            categoryId: catId ? Number(catId) : undefined,
            pageSize: 200
          }),
          api.products.getStockReport()
        ])
        setProducts(list.items)
        setReport(rep)
        setSelectedIds(new Set())
      } finally {
        setLoading(false)
      }
    },
    []
  )

  const refreshAll = useCallback(async () => {
    await Promise.all([load(query.trim(), categoryId), loadCategories()])
  }, [load, loadCategories, query, categoryId])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void load(query.trim(), categoryId), 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, categoryId, load])

  // Nguồn dòng hiển thị: lọc cảnh báo lấy thẳng từ báo cáo (so sánh trong SQL).
  const rows = useMemo<Product[]>(() => {
    if (stockFilter === 'low') return report?.low_stock ?? []
    if (stockFilter === 'out') return report?.out_of_stock ?? []
    return products
  }, [stockFilter, report, products])

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = rows.length > 0 && rows.every((p) => selectedIds.has(p.id))

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((p) => p.id)))
  }

  function printSelected() {
    const items: BarcodePrintItem[] = products
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, price: p.price, qty: 1 }))
    if (items.length === 0) {
      toast.error('Chưa chọn sản phẩm nào để in tem.')
      return
    }
    setPrintItems(items)
  }

  async function handleDeactivate() {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    setBusyId(target.id)
    try {
      await api.products.deactivate(target.id)
      toast.success(`Đã xoá ${target.name} khỏi màn bán hàng`)
      await refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không xoá được sản phẩm. Thử lại nhé.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header + tabs */}
      <div className="border-b bg-card px-6 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Package className="h-6 w-6 text-primary" />
            Kho hàng
          </h1>
          <div className="flex items-center gap-2">
            {tab === 'products' && selectedIds.size > 0 && (
              <Button variant="outline" onClick={printSelected}>
                <Printer className="mr-1 h-4 w-4" />
                In tem ({selectedIds.size})
              </Button>
            )}
            {tab === 'products' && (
              <>
                <Button variant="outline" onClick={() => setShowImport(true)}>
                  <FileSpreadsheet className="mr-1 h-4 w-4" />
                  Nhập từ Excel
                </Button>
                <Button onClick={() => setShowAdd(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  Thêm sản phẩm
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1">
          {(
            [
              ['products', 'Sản phẩm', Package],
              ['categories', 'Danh mục', Tags],
              ['suppliers', 'Nhà cung cấp', Truck]
            ] as Array<[Tab, string, typeof Package]>
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={
                'flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ' +
                (tab === id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground')
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Tab SẢN PHẨM ===== */}
      {tab === 'products' && (
        <>
          <div className="space-y-3 border-b bg-card px-6 pb-4">
            <LowStockBanner
              report={
                report ?? {
                  product_count: 0,
                  stock_value_cents: 0,
                  low_stock_count: 0,
                  out_of_stock_count: 0,
                  low_stock: [],
                  out_of_stock: []
                }
              }
              filterMode={stockFilter}
              onFilterChange={setStockFilter}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Tìm theo tên hoặc mã vạch…"
                  className="pl-9"
                />
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={SELECT_CLS + ' w-56'}
                aria-label="Lọc theo nhóm hàng"
              >
                <option value="">Tất cả nhóm hàng</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.parent_id != null ? '↳ ' : ''}
                    {c.name}
                  </option>
                ))}
              </select>
              {stockFilter !== 'all' && (
                <Button size="sm" variant="ghost" onClick={() => setStockFilter('all')}>
                  Bỏ lọc cảnh báo
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                  <PackageOpen className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium">
                  {stockFilter === 'all' ? 'Chưa có sản phẩm nào' : 'Không còn sản phẩm nào trong mục cảnh báo'}
                </p>
                <p className="text-sm text-muted-foreground">
                  {stockFilter === 'all'
                    ? 'Thêm sản phẩm đầu tiên để bắt đầu bán hàng.'
                    : 'Tồn kho của bạn đang ổn — quay lại sau khi bán thêm.'}
                </p>
                {stockFilter === 'all' && (
                  <Button onClick={() => setShowAdd(true)} className="mt-1">
                    <Plus className="mr-1 h-4 w-4" />
                    Thêm sản phẩm
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Chọn tất cả để in tem"
                          className="h-4 w-4 rounded border-input accent-[var(--primary,#16a34a)]"
                        />
                      </TableHead>
                      <TableHead>Tên sản phẩm</TableHead>
                      <TableHead>Mã vạch</TableHead>
                      <TableHead className="text-right">Tồn kho</TableHead>
                      <TableHead className="text-right">Giá gốc</TableHead>
                      <TableHead className="text-right">Giá bán</TableHead>
                      <TableHead className="text-right">Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => {
                      const out = p.stock <= 0
                      const low = !out && p.low_stock_alert > 0 && p.stock <= p.low_stock_alert
                      const disabled = busyId === p.id
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              onChange={() => toggleSelect(p.id)}
                              aria-label={`Chọn ${p.name} để in tem`}
                              className="h-4 w-4 rounded border-input accent-[var(--primary,#16a34a)]"
                            />
                          </TableCell>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {p.barcode || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            {out ? (
                              <Badge variant="destructive">Hết hàng</Badge>
                            ) : low ? (
                              <Badge className="bg-amber-500 text-white hover:bg-amber-600">
                                còn {p.stock}
                              </Badge>
                            ) : (
                              <span className="font-mono tabular-nums">{p.stock}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                            {formatVnd(p.cost)}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold tabular-nums">
                            {formatVnd(p.price)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setEditTarget(p)}
                                disabled={disabled}
                                aria-label={`Chỉnh sửa ${p.name}`}
                                title="Sửa sản phẩm"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-emerald-700 hover:text-emerald-800"
                                onClick={() => setRestockTarget(p)}
                                disabled={disabled}
                                aria-label={`Nhập thêm hàng cho ${p.name}`}
                                title="Nhập thêm hàng"
                              >
                                <PackagePlus className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-amber-700 hover:text-amber-800"
                                onClick={() => setCorrectionTarget({ product: p, mode: 'adjust' })}
                                disabled={disabled}
                                aria-label={`Điều chỉnh tồn ${p.name}`}
                                title="Điều chỉnh tồn / hao hụt"
                              >
                                <Scale className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setMovementsTarget(p)}
                                disabled={disabled}
                                aria-label={`Thẻ kho ${p.name}`}
                                title="Thẻ kho"
                              >
                                <History className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setAssignmentTarget(p)}
                                disabled={disabled}
                                aria-label={`Gán nhóm / NCC cho ${p.name}`}
                                title="Gán nhóm / NCC"
                              >
                                <Tags className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  setPrintItems([
                                    { id: p.id, name: p.name, barcode: p.barcode, price: p.price, qty: 1 }
                                  ])
                                }
                                disabled={disabled}
                                aria-label={`In tem ${p.name}`}
                                title="In tem mã vạch"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(p)}
                                disabled={disabled}
                                aria-label={`Xoá ${p.name}`}
                                title="Xoá sản phẩm"
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
        </>
      )}

      {/* ===== Tab DANH MỤC ===== */}
      {tab === 'categories' && (
        <div className="flex-1 overflow-auto p-6">
          <CategoryManager
            onChanged={() => {
              void loadCategories()
              void load(query.trim(), categoryId)
            }}
          />
        </div>
      )}

      {/* ===== Tab NHÀ CUNG CẤP ===== */}
      {tab === 'suppliers' && (
        <div className="flex-1 overflow-auto p-6">
          <SupplierSection userId={userId} />
        </div>
      )}

      {/* ===== Dialogs tab Sản phẩm ===== */}
      <AddProductDialog open={showAdd} onClose={() => setShowAdd(false)} onCreated={() => void refreshAll()} />
      <ImportExcelDialog open={showImport} onClose={() => setShowImport(false)} onDone={() => void refreshAll()} />
      <EditProductDialog
        product={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={() => void refreshAll()}
      />
      <StockAdjustDialog
        product={restockTarget}
        userId={userId}
        onClose={() => setRestockTarget(null)}
        onUpdated={() => void refreshAll()}
      />
      <StockCorrectionDialog
        product={correctionTarget?.product ?? null}
        mode={correctionTarget?.mode ?? 'adjust'}
        userId={userId}
        onClose={() => setCorrectionTarget(null)}
        onUpdated={() => void refreshAll()}
      />
      <StockMovementsDialog
        product={movementsTarget}
        onClose={() => setMovementsTarget(null)}
      />
      <ProductAssignmentDialog
        product={assignmentTarget}
        onClose={() => setAssignmentTarget(null)}
        onUpdated={() => void refreshAll()}
      />
      <BarcodePrintDialog
        open={printItems !== null}
        items={printItems ?? []}
        onClose={() => setPrintItems(null)}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sản phẩm sẽ biến mất khỏi màn bán hàng. Lịch sử các hóa đơn cũ và thẻ kho vẫn được
              giữ nguyên. Bạn có thể tạo lại sản phẩm mới sau nếu cần.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeactivate}
            >
              Xoá sản phẩm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
