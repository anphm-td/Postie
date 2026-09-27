import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Eye,
  Printer,
  Ban,
  ReceiptText,
  Inbox,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@renderer/components/ui/dialog'
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
import { printReceipt } from '@renderer/components/pos/receipt'
import { loadStoreConfig } from '@renderer/components/pos/storeConfig'
import type { Order, OrderListResult, OrderStatus, PaymentMethod } from '@shared/types'

const PAGE_SIZE = 50

const STATUS_LABEL: Record<OrderStatus, string> = {
  0: 'Chờ thanh toán',
  1: 'Đã thanh toán',
  2: 'Đã hủy',
  3: 'Đã trả hàng',
  4: 'Còn thiếu tiền'
}

const STATUS_VARIANT: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  0: 'outline',
  1: 'default',
  2: 'destructive',
  3: 'secondary',
  4: 'secondary'
}

const STATUS_FILTERS: Array<[OrderStatus | 'all', string]> = [
  ['all', 'Tất cả'],
  [1, 'Đã thanh toán'],
  [4, 'Còn thiếu'],
  [0, 'Chờ'],
  [2, 'Đã hủy'],
  [3, 'Đã trả']
]

const VOIDABLE: OrderStatus[] = [0, 1, 4]

function dateToUnix(dateStr: string, endOfDay = false): number | undefined {
  if (!dateStr) return undefined
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return undefined
  const seconds = Math.floor(d.getTime() / 1000)
  return endOfDay ? seconds + 86400 : seconds
}

function unixToDateInput(seconds: number): string {
  const d = new Date(seconds * 1000)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function Invoices() {
  const { user } = useAuth()
  const isManager = (user?.role ?? 2) <= 1

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<OrderListResult | null>(null)
  const [loading, setLoading] = useState(true)

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [detail, setDetail] = useState<Order | null>(null)
  const [detailNames, setDetailNames] = useState<Record<number, string>>({})
  const [detailLoading, setDetailLoading] = useState(false)
  const [voidTarget, setVoidTarget] = useState<Order | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async (opts: { search: string; status: OrderStatus | 'all'; from: string; to: string; page: number }) => {
      setLoading(true)
      try {
        setData(
          await api.orders.list({
            search: opts.search.trim() || undefined,
            status: opts.status,
            from: dateToUnix(opts.from),
            to: dateToUnix(opts.to, true),
            page: opts.page,
            pageSize: PAGE_SIZE
          })
        )
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void load({ search: query, status, from: fromDate, to: toDate, page })
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, status, fromDate, toDate, page, load])

  useEffect(() => {
    api.payment_methods.list().then(setPaymentMethods).catch(() => setPaymentMethods([]))
  }, [])

  function resetFilters() {
    setQuery('')
    setStatus('all')
    setFromDate('')
    setToDate('')
    setPage(1)
  }

  async function openDetail(o: Order) {
    setDetail(o)
    setDetailNames({})
    setDetailLoading(true)
    try {
      const full = await api.orders.getById(o.id)
      if (full) {
        setDetail(full)
        const names: Record<number, string> = {}
        await Promise.all(
          (full.details ?? []).map(async (d) => {
            if (names[d.product_id]) return
            const p = await api.products.getById(d.product_id).catch(() => undefined)
            if (p) names[d.product_id] = p.name
          })
        )
        setDetailNames(names)
      }
    } catch {
      toast.error('Không tải được chi tiết hóa đơn')
    } finally {
      setDetailLoading(false)
    }
  }

  async function reprint(o: Order) {
    try {
      const cashier = await api.users.getById(o.user_id).catch(() => undefined)
      await printReceipt(o, {
        store: loadStoreConfig(),
        cashierName: cashier?.display_name ?? '',
        paymentMethods,
        customerName: o.customer_name ?? null
      })
    } catch {
      toast.error('Không in được hóa đơn.')
    }
  }

  async function confirmVoid() {
    if (!voidTarget) return
    setBusy(true)
    try {
      await api.orders.voidOrder(voidTarget.id, user?.id ?? 0, voidReason.trim() || undefined)
      toast.success(`Đã hủy hóa đơn #${voidTarget.invoice_no}`)
      setVoidTarget(null)
      setVoidReason('')
      if (detail?.id === voidTarget.id) setDetail({ ...detail, status: 2 })
      await load({ search: query, status, from: fromDate, to: toDate, page })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không hủy được hóa đơn. Thử lại nhé.')
    } finally {
      setBusy(false)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-4">
        <h1 className="text-xl font-bold">Hóa đơn</h1>
      </div>

      <div className="space-y-3 border-b bg-card px-6 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setPage(1)
                setQuery(e.target.value)
              }}
              placeholder="Mã hóa đơn hoặc tên khách…"
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Từ</span>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setPage(1)
                setFromDate(e.target.value)
              }}
              className="w-36"
            />
            <span>đến</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => {
                setPage(1)
                setToDate(e.target.value)
              }}
              className="w-36"
            />
          </div>
          {(query || status !== 'all' || fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Xóa lọc
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-1">
          {STATUS_FILTERS.map(([value, label]) => (
            <button
              key={String(value)}
              onClick={() => {
                setPage(1)
                setStatus(value)
              }}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                status === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
              <Inbox className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">Không có hóa đơn nào khớp bộ lọc</p>
            <p className="text-sm text-muted-foreground">
              Thử xóa lọc hoặc đổi khoảng thời gian tìm kiếm.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Hóa đơn</TableHead>
                    <TableHead>Thời gian</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead className="text-right">Mặt hàng</TableHead>
                    <TableHead className="text-right">Tổng</TableHead>
                    <TableHead className="text-right">Đã thu</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((o) => {
                    const voidable = VOIDABLE.includes(o.status)
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono font-semibold tabular-nums">
                          #{o.invoice_no}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateTime(o.created_at)}
                        </TableCell>
                        <TableCell className="max-w-36 truncate" title={o.customer_name ?? undefined}>
                          {o.customer_name || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {o.item_count ?? '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">
                          {formatVnd(o.total)}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {formatVnd(o.paid_amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openDetail(o)}
                              aria-label={`Xem hóa đơn #${o.invoice_no}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => reprint(o)}
                              aria-label={`In lại hóa đơn #${o.invoice_no}`}
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            {isManager && voidable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => setVoidTarget(o)}
                                aria-label={`Hủy hóa đơn #${o.invoice_no}`}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {data.total} hóa đơn · trang {data.page}/{totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ReceiptText className="h-5 w-5 text-primary" />
                  Hóa đơn #{detail.invoice_no}
                  <Badge variant={STATUS_VARIANT[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
                </DialogTitle>
                <DialogDescription>
                  {formatDateTime(detail.created_at)}
                  {detail.customer_name ? ` · ${detail.customer_name}` : ''}
                  {detail.note ? ` · ${detail.note}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="max-h-80 overflow-auto rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead className="text-right">Đơn giá</TableHead>
                      <TableHead className="text-right">SL</TableHead>
                      <TableHead className="text-right">Thành tiền</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-muted-foreground">
                          Đang tải…
                        </TableCell>
                      </TableRow>
                    ) : (
                      detail.details?.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="font-medium">
                            {detailNames[d.product_id] ?? `SP #${d.product_id}`}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatVnd(d.unit_price)}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">{d.quantity}</TableCell>
                          <TableCell className="text-right font-mono font-semibold tabular-nums">
                            {formatVnd(d.subtotal)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1.5 rounded-xl bg-secondary p-4 text-sm">
                {detail.discount_amount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Giảm giá</span>
                    <span className="font-mono tabular-nums">−{formatVnd(detail.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold">
                  <span>Tổng tiền</span>
                  <span className="font-mono text-lg tabular-nums">{formatVnd(detail.total)}</span>
                </div>
                {detail.payments?.map((p) => (
                  <div key={p.id} className="flex justify-between text-muted-foreground">
                    <span>
                      {paymentMethods.find((m) => m.id === p.payment_method_id)?.name ??
                        `Phương thức #${p.payment_method_id}`}
                    </span>
                    <span className="font-mono tabular-nums">{formatVnd(p.amount)}</span>
                  </div>
                ))}
                {detail.total - detail.paid_amount > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>Còn lại</span>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatVnd(detail.total - detail.paid_amount)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => reprint(detail)}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  In lại
                </Button>
                {isManager && VOIDABLE.includes(detail.status) && (
                  <Button
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => setVoidTarget(detail)}
                  >
                    <Ban className="mr-1.5 h-4 w-4" />
                    Hủy đơn
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={voidTarget !== null} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy hóa đơn #{voidTarget?.invoice_no}?</AlertDialogTitle>
            <AlertDialogDescription>
              Đơn sẽ chuyển sang trạng thái "Đã hủy": tồn kho được hoàn lại, nợ bán chịu (nếu có)
              được xóa, và lịch sử vẫn được giữ để đối chiếu. Tiền mặt đã thu cần hoàn trực tiếp cho
              khách.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label htmlFor="void-reason" className="text-sm font-medium">
              Lý do hủy (tùy chọn)
            </label>
            <Input
              id="void-reason"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="VD: Khách bỏ đơn / nhập sai"
              autoFocus
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Thôi, giữ lại</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void confirmVoid()
              }}
            >
              {busy ? 'Đang hủy…' : 'Xác nhận hủy đơn'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
