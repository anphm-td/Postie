import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertCircle, History, Inbox, ReceiptText, RotateCcw, Search } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@renderer/components/ui/table'
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
import type { Customer, Order, OrderDetailRow, OrderStatus } from '@shared/types'
import type { CreateReturnInput, ReturnRow } from '../../backend/db/repositories/returns'

// ============================================================================
//  Màn Đổi trả (roadmap P1.4 — "Trả hàng theo hóa đơn")
// ----------------------------------------------------------------------------
//  Luồng: tìm hóa đơn theo số hóa đơn (orders.getByInvoiceNo) hoặc chọn từ
//  danh sách đơn/phiếu trả gần đây → chọn số lượng cần trả theo dòng → ghi lý
//  do → xác nhận hoàn tiền qua returns.createReturn (repo lo 1 transaction:
//  returns + return_details + stock_movements type=1 + orders.status=3 khi trả
//  đủ + customer_ledger nếu bán chịu).
//
//  Số tiền hoàn từng dòng CHỈ là tạm tính trên UI — con số chính thức do repo
//  tính theo giá đã giảm (khuyến mại phân bổ theo tỷ lệ, dòng cuối gánh phần
//  dư — mirror returns.ts:129-140,159-160) và trả về trong ReturnRow.total.
// ============================================================================

const STATUS_LABEL: Record<OrderStatus, string> = {
  0: 'Chưa thu đủ',
  1: 'Đã thanh toán',
  2: 'Đã hủy',
  3: 'Đã trả hết',
  4: 'Trả một phần'
}

function statusVariant(s: OrderStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (s === 1) return 'default'
  if (s === 2) return 'destructive'
  if (s === 4) return 'secondary'
  return 'outline'
}

/** Phân bổ giảm giá toàn đơn theo tỷ lệ subtotal từng dòng — mirror repo. */
function buildAlloc(details: OrderDetailRow[], discount: number): Map<number, number> {
  const subtotalSum = details.reduce((s, d) => s + d.subtotal, 0)
  const map = new Map<number, number>()
  let used = 0
  details.forEach((d, i) => {
    const isLast = i === details.length - 1
    const share =
      subtotalSum > 0 && !isLast
        ? Math.round((discount * d.subtotal) / subtotalSum)
        : Math.max(0, discount - used)
    map.set(d.id, share)
    used += share
  })
  return map
}

export function Returns() {
  const { user } = useAuth()

  // Tra cứu + đơn đang chọn
  const [invoice, setInvoice] = useState('')
  const [order, setOrder] = useState<Order | null>(null)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [nameMap, setNameMap] = useState<Map<number, string>>(new Map())
  const [priorReturns, setPriorReturns] = useState<ReturnRow[]>([])
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Phiếu trả đang lập
  const [qty, setQty] = useState<Record<number, number>>({})
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [lastSlip, setLastSlip] = useState<ReturnRow | null>(null)

  // Danh sách bên trái + lịch sử phiếu trả
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [recentReturns, setRecentReturns] = useState<ReturnRow[]>([])

  const refreshSide = useCallback(async () => {
    try {
      const [orders, slips] = await Promise.all([api.orders.listRecent(20), api.returns.listRecent(15)])
      setRecentOrders(orders)
      setRecentReturns(slips)
    } catch {
      /* bỏ qua — danh sách phụ không chặn luồng chính */
    }
  }, [])

  useEffect(() => {
    void refreshSide()
  }, [refreshSide])

  /** Nạp một đơn làm "đơn đang xử lý" kèm khách + các phiếu trả trước đó. */
  const applyOrder = useCallback(async (o: Order) => {
    setOrder(o)
    setQty({})
    setReason('')
    setLastSlip(null)
    setLookupError(null)
    setLoadingDetail(true)
    try {
      const [cust, priors] = await Promise.all([
        o.customer_id != null ? api.customers.getById(o.customer_id) : Promise.resolve(undefined),
        api.returns.listByOrder(o.id)
      ])
      setCustomer(cust ?? null)
      setPriorReturns(priors)
      const names = await Promise.all(
        (o.details ?? []).map(async (d) => {
          const p = await api.products.getById(d.product_id).catch(() => undefined)
          return [d.product_id, p?.name ?? `Sản phẩm #${d.product_id}`] as const
        })
      )
      setNameMap(new Map(names))
    } catch {
      setPriorReturns([])
      setCustomer(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  async function handleSearch() {
    const n = Number(invoice.replace(/\D/g, ''))
    if (!n || !Number.isInteger(n)) {
      setLookupError('Nhập số hóa đơn hợp lệ (chỉ gồm chữ số).')
      return
    }
    setSearching(true)
    setLookupError(null)
    try {
      const o = await api.orders.getByInvoiceNo(n)
      if (!o) {
        setLookupError(`Không tìm thấy hóa đơn #${n} trong hệ thống.`)
        return
      }
      await applyOrder(o)
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Không tra cứu được hóa đơn.')
    } finally {
      setSearching(false)
    }
  }

  /** Chọn từ danh sách đơn/phiếu gần đây — listRecent chỉ trả header nên nạp đầy đủ. */
  const handlePickOrder = useCallback(
    async (orderId: number) => {
      setLookupError(null)
      try {
        const o = await api.orders.getById(orderId)
        if (!o) {
          setLookupError('Không tìm thấy đơn hàng.')
          return
        }
        await applyOrder(o)
      } catch {
        setLookupError('Không nạp được đơn hàng. Thử lại nhé.')
      }
    },
    [applyOrder]
  )

  // ---------------------------------------------------------------------------
  // Dữ liệu phái sinh cho bảng chọn dòng trả
  // ---------------------------------------------------------------------------

  const details = useMemo(() => order?.details ?? [], [order])

  const rows = useMemo(() => {
    const returnedMap = new Map<number, number>()
    for (const r of priorReturns) {
      for (const d of r.details ?? []) {
        returnedMap.set(d.order_detail_id, (returnedMap.get(d.order_detail_id) ?? 0) + d.quantity)
      }
    }
    const alloc = buildAlloc(details, order?.discount_amount ?? 0)
    return details.map((d) => {
      const returned = returnedMap.get(d.id) ?? 0
      const remaining = Math.max(0, d.quantity - returned)
      const r = Math.min(qty[d.id] ?? 0, remaining)
      const netLine = Math.max(0, d.subtotal - (alloc.get(d.id) ?? 0))
      const est = remaining > 0 ? Math.round((netLine * r) / d.quantity) : 0
      return { d, returned, remaining, r, est }
    })
  }, [details, priorReturns, order, qty])

  const selectedLines = rows.filter((row) => row.r > 0)
  const totalEstimate = rows.reduce((s, row) => s + row.est, 0)
  const fullyReturned = details.length > 0 && rows.every((row) => row.remaining === 0)

  const ineligibleReason = useMemo(() => {
    if (!order) return null
    if (order.held_at != null) return 'Đơn này đang treo (chưa thanh toán) — không thể trả hàng.'
    if (order.status === 2) return 'Đơn đã bị hủy — không thể trả hàng.'
    if (order.status === 3 || fullyReturned) return 'Đơn đã được trả hết hàng — không thể trả thêm.'
    return null
  }, [order, fullyReturned])

  const canReturn = order !== null && ineligibleReason === null && !loadingDetail
  const isCredit = order !== null && order.paid_amount < order.total
  const reasonOk = reason.trim().length > 0
  const canSubmit = canReturn && selectedLines.length > 0 && reasonOk && !submitting && !!user

  function setQtyFor(detailId: number, raw: string, remaining: number) {
    const n = Number(raw.replace(/\D/g, ''))
    const v = Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), remaining) : 0
    setQty((prev) => ({ ...prev, [detailId]: v }))
  }

  // ---------------------------------------------------------------------------
  // Tạo phiếu trả
  // ---------------------------------------------------------------------------

  async function doSubmit() {
    if (!order || !user || !canSubmit) return
    setSubmitting(true)
    try {
      const input: CreateReturnInput = {
        order_id: order.id,
        lines: selectedLines.map((row) => ({ order_detail_id: row.d.id, quantity: row.r })),
        reason: reason.trim(),
        user_id: user.id
      }
      const slip = await api.returns.createReturn(input)
      setLastSlip(slip)
      setQty({})
      setReason('')
      setConfirmOpen(false)
      toast.success(`Đã tạo phiếu trả #${slip.id} — hoàn ${formatVnd(slip.total)}`)
      // Nạp lại đơn (status có thể chuyển 3) + các phiếu trả để cập nhật số còn lại.
      const fresh = await api.orders.getById(order.id).catch(() => undefined)
      if (fresh) {
        setOrder(fresh)
        setPriorReturns(await api.returns.listByOrder(fresh.id))
      } else {
        setPriorReturns(await api.returns.listByOrder(order.id))
      }
      void refreshSide()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không tạo được phiếu trả. Thử lại nhé.'
      setConfirmOpen(false)
      setLookupError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2.5">
          <RotateCcw className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold">Đổi trả hàng</h1>
        </div>
        <p className="hidden text-sm text-muted-foreground sm:block">
          Trả hàng theo hóa đơn gốc — tiền hoàn tính theo giá đã giảm (khuyến mại).
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col gap-5 xl:flex-row">
          {/* ------------------------------ Cột tra cứu ------------------------------ */}
          <div className="w-full shrink-0 space-y-4 xl:w-[340px]">
            <Card>
              <CardContent className="p-4">
                <Label htmlFor="invoice-search" className="mb-2">
                  Tra cứu theo số hóa đơn
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="invoice-search"
                    inputMode="numeric"
                    value={invoice}
                    onChange={(e) => setInvoice(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSearch()
                    }}
                    placeholder="VD: 1001"
                    className="font-mono"
                    autoFocus
                  />
                  <Button onClick={() => void handleSearch()} disabled={searching}>
                    <Search className="mr-1 h-4 w-4" />
                    {searching ? 'Đang tìm…' : 'Tìm'}
                  </Button>
                </div>
                {lookupError && (
                  <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {lookupError}
                  </p>
                )}
              </CardContent>
            </Card>

            <div>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Đơn gần đây</h2>
              <div className="max-h-72 space-y-1 overflow-auto rounded-xl border bg-card p-1.5">
                {recentOrders.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Chưa có đơn hàng nào.</p>
                ) : (
                  recentOrders.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => void handlePickOrder(o.id)}
                      className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent ${
                        order?.id === o.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold tabular-nums">#{o.invoice_no}</span>
                        <span className="font-mono text-sm tabular-nums">{formatVnd(o.total)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">{formatDateTime(o.created_at)}</span>
                        <Badge variant={statusVariant(o.status)} className="px-1.5 py-0 text-[10px]">
                          {STATUS_LABEL[o.status]}
                        </Badge>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
                <History className="h-4 w-4" />
                Phiếu trả gần đây
              </h2>
              <div className="max-h-72 space-y-1 overflow-auto rounded-xl border bg-card p-1.5">
                {recentReturns.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Chưa có phiếu trả nào.</p>
                ) : (
                  recentReturns.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => void handlePickOrder(r.order_id)}
                      className="w-full rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
                      title={(r.details ?? []).map((d) => `${d.product_name ?? ''} ×${d.quantity}`).join(', ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold tabular-nums">#{r.invoice_no}</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-rose-600">
                          −{formatVnd(r.total)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="max-w-44 truncate text-xs text-muted-foreground">{r.reason ?? '—'}</span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* --------------------------- Cột lập phiếu trả --------------------------- */}
          <div className="min-w-0 flex-1 space-y-4">
            {loadingDetail ? (
              <div className="space-y-3">
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : !order ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card py-24 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-medium">Chưa chọn hóa đơn</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Nhập số hóa đơn ở khung tra cứu hoặc chọn một đơn gần đây để bắt đầu phiếu trả hàng.
                </p>
              </div>
            ) : (
              <>
                {/* Thông tin hóa đơn gốc */}
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <ReceiptText className="h-5 w-5 text-muted-foreground" />
                        <span className="font-mono text-lg font-bold tabular-nums">#{order.invoice_no}</span>
                      </div>
                      <Badge variant={statusVariant(order.status)}>{STATUS_LABEL[order.status]}</Badge>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm lg:grid-cols-4">
                      <InfoCell label="Thời gian" value={formatDateTime(order.created_at)} />
                      <InfoCell
                        label="Khách hàng"
                        value={customer ? customer.name : 'Khách vãng lai'}
                      />
                      <InfoCell label="Tổng tiền" value={formatVnd(order.total)} mono />
                      <InfoCell label="Đã thu" value={formatVnd(order.paid_amount)} mono />
                    </div>
                    {ineligibleReason && (
                      <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-sm leading-relaxed text-amber-800">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        {ineligibleReason}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {lastSlip && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
                    <p className="font-semibold text-emerald-800">
                      Đã tạo phiếu trả #{lastSlip.id} — hoàn {formatVnd(lastSlip.total)}
                    </p>
                    <p className="mt-0.5 text-emerald-700">
                      Tồn kho{(lastSlip.reason ? ` và lý do "${lastSlip.reason}"` : '')} đã được ghi nhận. Khách có
                      thể trả tiếp phần còn lại bằng phiếu mới.
                    </p>
                  </div>
                )}

                {/* Bảng chọn dòng cần trả */}
                <Card>
                  <CardContent className="p-0">
                    <div className="border-b px-4 py-3">
                      <h2 className="font-semibold">Chọn hàng cần trả</h2>
                      <p className="text-xs text-muted-foreground">
                        Nhập số lượng trả cho từng dòng — không vượt quá số còn lại của dòng.
                      </p>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Sản phẩm</TableHead>
                          <TableHead className="text-right">Đơn giá</TableHead>
                          <TableHead className="text-right">SL bán</TableHead>
                          <TableHead className="text-right">Đã trả</TableHead>
                          <TableHead className="text-right">SL trả</TableHead>
                          <TableHead className="text-right">Tiền hoàn tạm tính</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-muted-foreground">
                              Hóa đơn không có dòng hàng nào.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rows.map((row) => {
                            const disabled = row.remaining === 0 || !canReturn
                            return (
                              <TableRow key={row.d.id} className={row.remaining === 0 ? 'opacity-60' : undefined}>
                                <TableCell className="font-medium">
                                  {nameMap.get(row.d.product_id) ?? `Sản phẩm #${row.d.product_id}`}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                  {formatVnd(row.d.unit_price)}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">{row.d.quantity}</TableCell>
                                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                                  {row.returned}
                                </TableCell>
                                <TableCell className="text-right">
                                  {row.remaining > 0 && canReturn ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <Input
                                        inputMode="numeric"
                                        value={row.r > 0 ? String(row.r) : ''}
                                        placeholder="0"
                                        className="h-8 w-16 text-right font-mono tabular-nums"
                                        aria-label={`Số lượng trả ${nameMap.get(row.d.product_id) ?? ''}`}
                                        onChange={(e) => setQtyFor(row.d.id, e.target.value, row.remaining)}
                                      />
                                      <button
                                        type="button"
                                        className="text-xs font-medium text-primary hover:underline"
                                        onClick={() =>
                                          setQty((prev) => ({ ...prev, [row.d.id]: row.remaining }))
                                        }
                                        disabled={disabled}
                                      >
                                        Hết
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono font-semibold tabular-nums">
                                  {row.r > 0 ? formatVnd(row.est) : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Lý do + xác nhận hoàn tiền */}
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="return-reason">Lý do trả hàng *</Label>
                      <Input
                        id="return-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="VD: Khách đổi ý, hàng lỗi do nhà sản xuất…"
                        disabled={!canReturn}
                      />
                      {!reasonOk && canReturn && selectedLines.length > 0 && (
                        <p className="text-xs text-muted-foreground">Bắt buộc ghi lý do để lưu vào phiếu trả.</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Tạm tính hoàn cho {selectedLines.length} dòng
                        </div>
                        <div className="font-mono text-2xl font-bold tabular-nums">
                          {formatVnd(totalEstimate)}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isCredit
                            ? 'Đơn bán chịu — tiền hoàn sẽ ghi giảm công nợ khách qua sổ cái.'
                            : 'Đơn đã trả đủ — thu ngân hoàn tiền mặt cho khách tại quầy.'}
                        </p>
                      </div>
                      <Button
                        size="lg"
                        disabled={!canSubmit}
                        onClick={() => setConfirmOpen(true)}
                        className="shrink-0"
                      >
                        <RotateCcw className="mr-1.5 h-4 w-4" />
                        Xác nhận hoàn tiền
                      </Button>
                    </div>
                    {canReturn && !reasonOk && selectedLines.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Chưa chọn dòng nào — nhập số lượng cần trả ở bảng trên.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Xác nhận hoàn tiền */}
      {order && (
        <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Xác nhận hoàn {formatVnd(totalEstimate)}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm leading-relaxed">
                  <p>
                    Tạo phiếu trả cho hóa đơn <b className="font-mono">#{order.invoice_no}</b> với{' '}
                    {selectedLines.length} dòng hàng.
                  </p>
                  <p>
                    {isCredit
                      ? 'Đơn bán chịu: số tiền hoàn ghi giảm công nợ của khách qua sổ cái.'
                      : 'Đơn đã trả đủ: thu ngân đưa tiền mặt cho khách ngay tại quầy.'}{' '}
                    Hàng được nhập lại kho và thao tác được ghi vào nhật ký hệ thống.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Xem lại</AlertDialogCancel>
              <AlertDialogAction
                disabled={!canSubmit}
                onClick={(e) => {
                  e.preventDefault()
                  void doSubmit()
                }}
              >
                {submitting ? 'Đang lưu…' : 'Hoàn tiền & nhập lại kho'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function InfoCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono font-semibold tabular-nums' : 'font-medium'}>{value}</div>
    </div>
  )
}
