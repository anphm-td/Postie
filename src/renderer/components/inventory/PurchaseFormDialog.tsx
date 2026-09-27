import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, ScanLine, Trash2, Truck } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { dongToCents, formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { MoneyInput } from '@renderer/components/ui/money-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { Product, Supplier } from '@shared/types'

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

interface PurchaseLine {
  product: Product
  qty: number
  costDong: string
}

interface PurchaseFormDialogProps {
  open: boolean
  userId: number
  onClose: () => void
  onCreated: () => void
}

/**
 * TẠO PHIẾU NHẬP HÀNG (P1.2 — purchases:create): chọn NCC, thêm dòng bằng
 * quét mã vạch (Enter tăng SL) hoặc tìm theo tên; mỗi dòng có số lượng +
 * đơn giá NCC (prefill giá vốn hiện tại — sẽ thành products.cost khi nhận).
 * `paid` > 0 = trả trước/cọc khi tạo (supplier_ledger type=1).
 */
export function PurchaseFormDialog({ open, userId, onClose, onCreated }: PurchaseFormDialogProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [lines, setLines] = useState<PurchaseLine[]>([])
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [note, setNote] = useState('')
  const [paidDong, setPaidDong] = useState('')
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!open) return
    setSupplierId('')
    setLines([])
    setSearch('')
    setResults([])
    setNote('')
    setPaidDong('')
    void api.suppliers.list({ activeOnly: true, pageSize: 200 }).then((res) => setSuppliers(res.items))
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  // Tìm sản phẩm (debounce 250ms) — chỉ hàng đang kinh doanh.
  useEffect(() => {
    if (!open) return
    if (timer.current) clearTimeout(timer.current)
    const q = search.trim()
    if (!q) {
      setResults([])
      return
    }
    timer.current = setTimeout(() => {
      void api.products
        .list({ search: q, activeOnly: true, pageSize: 8 })
        .then((res) => setResults(res.items))
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [search, open])

  const addProduct = useCallback((p: Product) => {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product.id === p.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 }
        return next
      }
      return [...prev, { product: p, qty: 1, costDong: String(Math.round(p.cost / 100)) }]
    })
    setSearch('')
    setResults([])
    searchRef.current?.focus()
  }, [])

  // Quét mã vạch: Enter với mã khớp tuyệt đối → tăng SL; nếu không, thêm kết quả đầu.
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = search.trim()
    if (!q) return
    const exact = results.find((p) => (p.barcode || '').trim() === q)
    const target = exact ?? results[0]
    if (target) {
      addProduct(target)
    } else {
      toast.error(`Không tìm thấy sản phẩm nào khớp "${q}".`)
    }
  }

  function setLineQty(index: number, qty: number) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, qty: Math.max(1, Math.floor(qty) || 1) } : l)))
  }

  function setLineCost(index: number, costDong: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, costDong } : l)))
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index))
  }

  const totalCents = lines.reduce((s, l) => s + l.qty * dongToCents(l.costDong), 0)
  const paidCents = dongToCents(paidDong)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) {
      toast.error('Vui lòng chọn nhà cung cấp.')
      return
    }
    if (lines.length === 0) {
      toast.error('Phiếu nhập phải có ít nhất một dòng hàng.')
      return
    }
    if (!userId) {
      toast.error('Không xác định được người tạo phiếu. Vui lòng đăng nhập lại.')
      return
    }
    setSaving(true)
    try {
      const po = await api.purchases.create({
        supplier_id: Number(supplierId),
        details: lines.map((l) => ({
          product_id: l.product.id,
          qty: l.qty,
          cost: dongToCents(l.costDong)
        })),
        paid: paidCents > 0 ? paidCents : undefined,
        note: note.trim() || undefined,
        created_by: userId
      })
      toast.success(`Đã tạo phiếu nhập #${po.id} — ${formatVnd(po.total)}.`)
      onCreated()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không tạo được phiếu nhập.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Tạo phiếu nhập hàng
          </DialogTitle>
          <DialogDescription>
            Quét mã vạch hoặc tìm theo tên để thêm hàng. Tồn kho và công nợ chỉ được ghi khi nhận
            hàng từ NCC.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="po-supplier">Nhà cung cấp *</Label>
              <select
                id="po-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">— Chọn NCC —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.phone ? ` (${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-search">Thêm hàng — quét mã vạch hoặc nhập tên</Label>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="po-search"
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Quét mã → Enter để tăng số lượng"
                  className="pl-9"
                />
              </div>
              {results.length > 0 && (
                <div className="max-h-36 space-y-1 overflow-auto rounded-lg border bg-background p-1">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {p.name}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {p.barcode || `#${p.id}`}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        tồn {p.stock}
                      </span>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dòng hàng */}
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
            {lines.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Chưa có hàng nào. Quét mã vạch hoặc tìm theo tên để thêm dòng.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Sản phẩm</th>
                    <th className="w-24 px-3 py-2 font-medium">SL</th>
                    <th className="w-40 px-3 py-2 font-medium">Đơn giá NCC (₫)</th>
                    <th className="w-32 px-3 py-2 text-right font-medium">Thành tiền</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.product.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <p className="truncate font-medium" title={l.product.name}>
                          {l.product.name}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {l.product.barcode || `#${l.product.id}`}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={String(l.qty)}
                          onChange={(e) => setLineQty(i, Number(e.target.value.replace(/\D/g, '')) || 1)}
                          inputMode="numeric"
                          className="h-8 text-right"
                          aria-label={`Số lượng ${l.product.name}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <MoneyInput
                          value={l.costDong}
                          onValueChange={(v) => setLineCost(i, v)}
                          className="h-8"
                          aria-label={`Đơn giá ${l.product.name}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {formatVnd(l.qty * dongToCents(l.costDong))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => removeLine(i)}
                          aria-label={`Bỏ ${l.product.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="po-note">Ghi chú</Label>
              <Input
                id="po-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: nhập đợt đầu tháng"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-paid">Trả trước / cọc khi tạo (₫)</Label>
              <MoneyInput id="po-paid" value={paidDong} onValueChange={setPaidDong} placeholder="0" />
              <p className="text-xs text-muted-foreground">
                Bỏ trống = ghi nợ NCC toàn bộ khi nhận hàng.
              </p>
            </div>
          </div>

          <DialogFooter className="items-center gap-3 border-t pt-4 sm:gap-3">
            <div className="mr-auto flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{lines.length} dòng</span>
              <span>
                Tổng phiếu:{' '}
                <span className="font-mono text-base font-bold tabular-nums">{formatVnd(totalCents)}</span>
              </span>
            </div>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving || lines.length === 0}>
              Tạo phiếu nhập
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
