import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Barcode,
  CheckCircle2,
  ClipboardList,
  PackageOpen,
  Plus,
  Printer,
  Trash2,
  X
} from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatDateTime } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import { STOCKTAKE_STATUS_META } from '@renderer/components/inventory/labels'
import { BarcodePrintDialog } from '@renderer/components/inventory/BarcodePrintDialog'
import type { Stocktake, StocktakeDetailRow } from '@shared/types'
import type { BarcodePrintItem } from '@renderer/components/inventory/BarcodePrintDialog'

/**
 * KIỂM KHO (P1.3 — stocktakes:open/addLine/removeLine/complete/cancel):
 * quét mã liên tục (Enter tăng số đếm), sửa số đếm tay, chênh lệch tự tính
 * (diff = counted − book), "Hoàn thành" sinh stock_movements type=3 với delta
 * = counted − book trong 1 transaction (repo cho phép âm khi thiếu hàng).
 */
export function Stocktakes() {
  const { user } = useAuth()
  const userId = user?.id ?? 0

  const [takes, setTakes] = useState<Stocktake[]>([])
  const [statusFilter, setStatusFilter] = useState<'' | 0 | 1 | 2>('')
  const [listLoading, setListLoading] = useState(true)

  const [selected, setSelected] = useState<Stocktake | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [scan, setScan] = useState('')
  const [edits, setEdits] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)

  const [showOpen, setShowOpen] = useState(false)
  const [openNote, setOpenNote] = useState('')
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [printTarget, setPrintTarget] = useState<BarcodePrintItem[] | null>(null)

  const scanRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadList = useCallback(async () => {
    setListLoading(true)
    try {
      setTakes(
        await api.stocktakes.list({
          status: statusFilter === '' ? undefined : statusFilter,
          limit: 100
        })
      )
    } finally {
      setListLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const loadDetail = useCallback(async (id: number) => {
    setDetailLoading(true)
    try {
      const full = await api.stocktakes.getById(id)
      setSelected(full ?? null)
      setEdits({})
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // Quét mã / tìm tên → thêm dòng đếm (debounce cho gợi ý).
  const suggestions = useMemo(() => {
    const q = scan.trim()
    if (q.length < 2) return []
    return (selected?.details ?? []).filter(
      (d) =>
        (d.product_name ?? '').toLowerCase().includes(q.toLowerCase()) ||
        (d.barcode ?? '').includes(q)
    )
  }, [scan, selected])

  const addCounted = useCallback(
    async (productId: number, increment: number) => {
      if (!selected || selected.status !== 0) return
      const current = (selected.details ?? []).find((d) => d.product_id === productId)
      const counted = (current?.counted_qty ?? 0) + increment
      setBusy(true)
      try {
        await api.stocktakes.addLine(selected.id, { product_id: productId, counted_qty: counted })
        await loadDetail(selected.id)
        setScan('')
        setTimeout(() => scanRef.current?.focus(), 30)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Không ghi được số đếm.')
      } finally {
        setBusy(false)
      }
    },
    [selected, loadDetail]
  )

  function handleScanEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const q = scan.trim()
    if (!q) return
    const line = (selected?.details ?? []).find(
      (d) => (d.barcode ?? '').trim() === q || String(d.product_id) === q
    )
    if (line) {
      void addCounted(line.product_id, 1)
    } else {
      toast.error(`Mã "${q}" chưa có trong phiếu kiểm. Dùng gợi ý bên dưới để thêm.`)
    }
  }

  async function handleOpenCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) {
      toast.error('Không xác định được người mở phiếu.')
      return
    }
    setBusy(true)
    try {
      const st = await api.stocktakes.open(userId, { note: openNote.trim() || undefined })
      toast.success(`Đã mở phiếu kiểm #${st.id}.`)
      setShowOpen(false)
      setOpenNote('')
      await loadList()
      await loadDetail(st.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không mở được phiếu kiểm.')
    } finally {
      setBusy(false)
    }
  }

  // Sửa số đếm tay — commit khi blur/Enter nếu giá trị thay đổi.
  async function commitEdit(d: StocktakeDetailRow) {
    if (!selected) return
    const raw = edits[d.id]
    if (raw == null) return
    const n = Number(raw.trim())
    if (!Number.isInteger(n) || n < 0) {
      toast.error('Số đếm phải là số nguyên không âm.')
      return
    }
    if (n === d.counted_qty) {
      setEdits((prev) => {
        const next = { ...prev }
        delete next[d.id]
        return next
      })
      return
    }
    setBusy(true)
    try {
      await api.stocktakes.addLine(selected.id, { product_id: d.product_id, counted_qty: n })
      await loadDetail(selected.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không lưu được số đếm.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveLine(d: StocktakeDetailRow) {
    if (!selected) return
    setBusy(true)
    try {
      await api.stocktakes.removeLine(selected.id, d.id)
      await loadDetail(selected.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không xóa được dòng kiểm.')
    } finally {
      setBusy(false)
    }
  }

  async function handleComplete() {
    if (!selected) return
    setConfirmComplete(false)
    if (!userId) {
      toast.error('Không xác định được người hoàn thành phiếu.')
      return
    }
    setBusy(true)
    try {
      await api.stocktakes.complete({ stocktake_id: selected.id, created_by: userId })
      toast.success(`Đã hoàn thành phiếu kiểm #${selected.id} — kho được cân bằng về số thực tế.`)
      await loadList()
      await loadDetail(selected.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không hoàn thành được phiếu kiểm.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCancelTake() {
    if (!selected) return
    setConfirmCancel(false)
    setBusy(true)
    try {
      await api.stocktakes.cancel(selected.id)
      toast.success(`Đã hủy phiếu kiểm #${selected.id}.`)
      await loadList()
      await loadDetail(selected.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không hủy được phiếu kiểm.')
    } finally {
      setBusy(false)
    }
  }

  const details = selected?.details ?? []
  const diffLines = details.filter((d) => (d.diff_qty ?? 0) !== 0)
  const totalMissing = details.reduce((s, d) => s + Math.max(0, -(d.diff_qty ?? 0)), 0)
  const totalExtra = details.reduce((s, d) => s + Math.max(0, d.diff_qty ?? 0), 0)
  const isWorking = selected?.status === 0


  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Kiểm kho</h1>
        </div>
        <div className="flex items-center gap-2">
          {selected && (
            <Button variant="outline" onClick={() => setSelected(null)}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Về danh sách
            </Button>
          )}
          <Button onClick={() => setShowOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Mở phiếu kiểm
          </Button>
        </div>
      </div>

      {selected ? (
        <div className="flex-1 space-y-4 overflow-auto p-6">
          {/* Header phiếu */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-semibold">
                Phiếu kiểm #{selected.id}
                {selected.status != null && (
                  <Badge variant="secondary" className={STOCKTAKE_STATUS_META[selected.status].badge}>
                    {STOCKTAKE_STATUS_META[selected.status].label}
                  </Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                Mở {formatDateTime(selected.created_at)}
                {selected.note ? ` · ${selected.note}` : ''}
              </p>
            </div>
            {isWorking && (
              <div className="flex items-center gap-2">
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmCancel(true)} disabled={busy}>
                  <X className="mr-1 h-4 w-4" />
                  Hủy phiếu
                </Button>
                <Button onClick={() => setConfirmComplete(true)} disabled={busy || details.length === 0}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />
                  Hoàn thành &amp; cập nhật kho
                </Button>
              </div>
            )}
          </div>

          {/* Quét / tìm khi đang kiểm */}
          {isWorking && (
            <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
              <Label htmlFor="st-scan">Quét mã vạch hoặc nhập tên / mã SP — Enter để tăng số đếm</Label>
              <div className="relative">
                <Barcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="st-scan"
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={handleScanEnter}
                  placeholder="VD: 8934563219…"
                  className="pl-9"
                  autoFocus
                  disabled={busy}
                />
              </div>
              {suggestions.length > 0 && (
                <div className="space-y-1 rounded-lg border p-1">
                  {suggestions.slice(0, 6).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={busy}
                      onClick={() => addCounted(d.product_id, 1)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                    >
                      <span className="min-w-0 flex-1 truncate">{d.product_name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        sách {d.book_qty} · đếm {d.counted_qty}
                      </span>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                    </button>
                  ))}
                </div>
              )}
              {scan.trim().length >= 2 && suggestions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Không khớp dòng nào trong phiếu. Chỉ có thể kiểm các SP đã thêm vào phiếu (thêm
                  nhanh bằng quét mã đã có mặt ở đây, hoặc mở phiếu mới kèm danh sách).
                </p>
              )}
            </div>
          )}

          {/* Bảng dòng kiểm */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {detailLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : details.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center">
                <PackageOpen className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Phiếu chưa có dòng nào</p>
                <p className="text-sm text-muted-foreground">
                  {isWorking
                    ? 'Quét mã vạch hoặc nhập tên sản phẩm ở ô trên để bắt đầu đếm.'
                    : 'Phiếu này không có dòng kiểm.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead className="text-right">Tồn sách</TableHead>
                    <TableHead className="w-28 text-right">Số đếm</TableHead>
                    <TableHead className="text-right">Chênh lệch</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((d) => {
                    const diff = d.diff_qty ?? d.counted_qty - d.book_qty
                    const editing = edits[d.id] != null
                    return (
                      <TableRow key={d.id}>
                        <TableCell>
                          <p className="font-medium">{d.product_name}</p>
                          <p className="font-mono text-xs text-muted-foreground">
                            {d.barcode || `#${d.product_id}`}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{d.book_qty}</TableCell>
                        <TableCell className="text-right">
                          {isWorking ? (
                            <Input
                              value={editing ? (edits[d.id] ?? '') : String(d.counted_qty)}
                              onChange={(e) =>
                                setEdits((prev) => ({
                                  ...prev,
                                  [d.id]: e.target.value.replace(/\D/g, '').slice(0, 6)
                                }))
                              }
                              onBlur={() => commitEdit(d)}
                              onKeyDown={(e) => e.key === 'Enter' && void commitEdit(d)}
                              inputMode="numeric"
                              className="ml-auto h-8 w-24 text-right"
                              aria-label={`Số đếm ${d.product_name}`}
                              disabled={busy}
                            />
                          ) : (
                            <span className="font-mono font-semibold tabular-nums">{d.counted_qty}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {diff === 0 ? (
                            <span className="text-sm text-muted-foreground">Đúng</span>
                          ) : diff > 0 ? (
                            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                              Thừa {diff}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">Thiếu {-diff}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {isWorking && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveLine(d)}
                              disabled={busy}
                              aria-label={`Bỏ ${d.product_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Tổng hợp chênh lệch */}
          {details.length > 0 && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-4 text-sm shadow-sm">
              <span>
                <span className="font-mono font-bold">{details.length}</span> dòng kiểm
              </span>
              <span>
                <span className="font-mono font-bold text-emerald-700">{details.length - diffLines.length}</span>{' '}
                dòng đúng
              </span>
              <span>
                Thiếu: <span className="font-mono font-bold text-destructive">{totalMissing}</span>
              </span>
              <span>
                Thừa: <span className="font-mono font-bold text-emerald-700">{totalExtra}</span>
              </span>
              {isWorking && (
                <span className="ml-auto text-xs text-muted-foreground">
                  "Hoàn thành" sẽ ghi stock_movements type=3 với delta = đếm − sách (cho phép âm).
                </span>
              )}
              {!isWorking && selected.status === 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    setPrintTarget(
                      details.map((d) => ({
                        id: d.product_id,
                        name: d.product_name ?? `SP #${d.product_id}`,
                        barcode: d.barcode ?? null,
                        price: 0,
                        qty: 1
                      }))
                    )
                  }
                >
                  <Printer className="mr-1 h-4 w-4" />
                  In tem các SP trong phiếu
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Danh sách phiếu */
        <div className="flex-1 space-y-4 overflow-auto p-6">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['', 'Tất cả'],
                [0, 'Đang kiểm'],
                [1, 'Hoàn thành'],
                [2, 'Đã hủy']
              ] as Array<['' | 0 | 1 | 2, string]>
            ).map(([value, label]) => (
              <Button
                key={String(value)}
                size="sm"
                variant={statusFilter === value ? 'default' : 'outline'}
                onClick={() => setStatusFilter(value)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {listLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : takes.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Chưa có phiếu kiểm nào</p>
                <p className="text-sm text-muted-foreground">
                  Mở phiếu kiểm để đối chiếu tồn số sách với số đếm thực tế.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Phiếu</TableHead>
                    <TableHead>Ghi chú</TableHead>
                    <TableHead>Ngày mở</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {takes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono font-medium">#{t.id}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground" title={t.note ?? undefined}>
                        {t.note || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(t.created_at)}</TableCell>
                      <TableCell>
                        {t.status != null && (
                          <Badge variant="secondary" className={STOCKTAKE_STATUS_META[t.status].badge}>
                            {STOCKTAKE_STATUS_META[t.status].label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={t.status === 0 ? 'default' : 'outline'}
                          onClick={() => loadDetail(t.id)}
                        >
                          {t.status === 0 ? 'Kiểm tiếp' : 'Xem'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* Mở phiếu kiểm */}
      <Dialog open={showOpen} onOpenChange={(o) => !o && !busy && setShowOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mở phiếu kiểm kho</DialogTitle>
            <DialogDescription>
              Mẹo: nên hoàn thành phiếu sớm sau khi đếm — bán hàng trong lúc kiểm sẽ làm lệch chênh
              lệch (tồn sách chốt tại thời điểm thêm dòng).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleOpenCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="st-note">Ghi chú</Label>
              <Input
                id="st-note"
                value={openNote}
                onChange={(e) => setOpenNote(e.target.value)}
                placeholder="VD: kiểm cuối tháng 9"
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => setShowOpen(false)} disabled={busy}>
                Hủy
              </Button>
              <Button type="submit" disabled={busy}>
                Mở phiếu
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Xác nhận hoàn thành */}
      <AlertDialog open={confirmComplete} onOpenChange={setConfirmComplete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hoàn thành phiếu kiểm #{selected?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Kho sẽ được cân bằng về số đếm thực tế: {details.length} dòng, trong đó{' '}
              {diffLines.length} dòng lệch (thiếu {totalMissing}, thừa {totalExtra}). Mỗi dòng lệch
              sinh một biến động điều chỉnh trong thẻ kho — không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kiểm tiếp</AlertDialogCancel>
            <AlertDialogAction onClick={handleComplete}>Hoàn thành</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Xác nhận hủy phiếu */}
      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy phiếu kiểm #{selected?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Phiếu hủy không đụng tới tồn kho. Dòng đếm đã nhập sẽ không dùng được nữa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kiểm tiếp</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancelTake}
            >
              Hủy phiếu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BarcodePrintDialog
        open={printTarget !== null}
        items={printTarget ?? []}
        onClose={() => setPrintTarget(null)}
      />

    </div>
  )
}
