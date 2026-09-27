// ============================================================================
//  Đơn gần đây + HỦY ĐƠN (P0.3 — roadmap: "thêm IPC orders:void … dữ liệu đã
//  đủ") và in lại hóa đơn. orders:voidOrder (repo) tự trả tồn qua
//  stock_movements, xóa nợ bán chịu, nhả voucher và ghi audit_log trong 1 tx.
// ============================================================================

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Ban, Loader2, Printer } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatDateTime, formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { printReceipt } from './receipt'
import { loadStoreConfig } from './storeConfig'
import type { Order, PaymentMethod } from '@shared/types'

const STATUS_LABEL: Record<number, { label: string; variant: 'secondary' | 'outline' | 'destructive' | 'default' }> = {
  0: { label: 'Chờ thanh toán', variant: 'outline' },
  1: { label: 'Đã thanh toán', variant: 'default' },
  2: { label: 'Đã hủy', variant: 'secondary' },
  3: { label: 'Đã trả hàng', variant: 'outline' },
  4: { label: 'Còn thiếu tiền', variant: 'outline' }
}

/** Đơn được phép hủy: chưa hủy/chưa trả hàng và không phải đơn treo (đơn treo hủy ở dialog riêng). */
function isVoidable(o: Order): boolean {
  return o.held_at == null && (o.status === 0 || o.status === 1 || o.status === 4)
}

interface RecentOrdersDialogProps {
  open: boolean
  userId: number
  paymentMethods: PaymentMethod[]
  onClose: () => void
  /** Báo Register refresh tồn kho + đơn treo sau khi hủy. */
  onOrdersChanged: () => void
}

export function RecentOrdersDialog({
  open,
  userId,
  paymentMethods,
  onClose,
  onOrdersChanged
}: RecentOrdersDialogProps) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [viewing, setViewing] = useState<Order | null>(null)
  const [detailNames, setDetailNames] = useState<Record<number, string>>({})
  const [customerName, setCustomerName] = useState<string | null>(null)
  const [voidTarget, setVoidTarget] = useState<Order | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setViewing(null)
    setVoidTarget(null)
    setVoidReason('')
    setLoading(true)
    api.orders
      .listRecent(30)
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [open])

  async function openDetail(order: Order) {
    try {
      const full = await api.orders.getById(order.id)
      if (!full) {
        toast.error('Không tìm thấy hóa đơn')
        return
      }
      setViewing(full)
      setVoidTarget(null)
      const ids = [...new Set((full.details ?? []).map((d) => d.product_id))]
      const products = await Promise.all(
        ids.map((id) => api.products.getById(id).catch(() => undefined))
      )
      const names: Record<number, string> = {}
      products.forEach((p) => {
        if (p) names[p.id] = p.name
      })
      setDetailNames(names)
      if (full.customer_id) {
        const c = await api.customers.getById(full.customer_id).catch(() => undefined)
        setCustomerName(c?.name ?? null)
      } else {
        setCustomerName(null)
      }
    } catch {
      toast.error('Không tải được chi tiết hóa đơn')
    }
  }

  async function reprint(order: Order) {
    try {
      const cashier = await api.users.getById(order.user_id).catch(() => undefined)
      await printReceipt(order, {
        store: loadStoreConfig(),
        cashierName: cashier?.display_name ?? '',
        paymentMethods,
        customerName
      })
    } catch {
      toast.error('Không in được hóa đơn.')
    }
  }

  async function confirmVoid() {
    if (!voidTarget) return
    setBusy(true)
    try {
      await api.orders.voidOrder(voidTarget.id, userId, voidReason.trim() || undefined)
      toast.success(`Đã hủy hóa đơn #${voidTarget.invoice_no}`)
      setVoidTarget(null)
      setVoidReason('')
      setViewing(null)
      const fresh = await api.orders.listRecent(30).catch(() => [])
      setOrders(fresh)
      onOrdersChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hủy đơn thất bại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Đơn gần đây</DialogTitle>
          <DialogDescription>
            Xem chi tiết, in lại hoặc hủy hóa đơn (tồn kho được trả lại tự động).
          </DialogDescription>
        </DialogHeader>

        {voidTarget ? (
          <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <p className="text-sm leading-relaxed">
              Hủy hóa đơn <b>#{voidTarget.invoice_no}</b> ({formatVnd(voidTarget.total)})? Tồn kho sẽ
              được trả lại, không thể hoàn tác.
            </p>
            <Input
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Lý do hủy (tùy chọn)…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setVoidTarget(null)} disabled={busy}>
                Giữ hóa đơn
              </Button>
              <Button variant="destructive" onClick={confirmVoid} disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Đang hủy…
                  </>
                ) : (
                  <>
                    <Ban className="mr-1 h-4 w-4" /> Xác nhận hủy
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : viewing ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                Hóa đơn #{viewing.invoice_no}{' '}
                <span className="font-normal text-muted-foreground">
                  · {formatDateTime(viewing.created_at)}
                </span>
              </div>
              <Badge variant={STATUS_LABEL[viewing.status]?.variant ?? 'outline'}>
                {STATUS_LABEL[viewing.status]?.label ?? `Trạng thái ${viewing.status}`}
              </Badge>
            </div>
            <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border p-3 text-sm">
              {(viewing.details ?? []).map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {detailNames[d.product_id] ?? `SP #${d.product_id}`}
                    <span className="ml-1 font-mono text-xs tabular-nums text-muted-foreground">
                      {d.quantity} × {formatVnd(d.unit_price)}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {formatVnd(Math.max(0, d.unit_price * d.quantity - d.discount_amount))}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tổng tiền</span>
                <span className="font-mono font-bold tabular-nums">{formatVnd(viewing.total)}</span>
              </div>
              {(viewing.payments ?? []).map((p) => {
                const m = paymentMethods.find((pm) => pm.id === p.payment_method_id)
                return (
                  <div key={p.id} className="flex justify-between text-muted-foreground">
                    <span>{m?.name ?? `Phương thức #${p.payment_method_id}`}</span>
                    <span className="font-mono tabular-nums">{formatVnd(p.amount)}</span>
                  </div>
                )
              })}
              {viewing.total - viewing.paid_amount > 0 && (
                <div className="flex justify-between text-amber-700">
                  <span>Còn nợ</span>
                  <span className="font-mono tabular-nums">
                    {formatVnd(viewing.total - viewing.paid_amount)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setViewing(null)}>
                Đóng
              </Button>
              <Button variant="outline" onClick={() => void reprint(viewing)}>
                <Printer className="mr-1 h-4 w-4" /> In lại
              </Button>
              {isVoidable(viewing) && (
                <Button variant="destructive" onClick={() => setVoidTarget(viewing)}>
                  <Ban className="mr-1 h-4 w-4" /> Hủy đơn
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-1.5 overflow-y-auto">
            {loading && <p className="py-6 text-center text-sm text-muted-foreground">Đang tải…</p>}
            {!loading && orders.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Chưa có hóa đơn nào.</p>
            )}
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => void openDetail(o)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="min-w-0">
                  <span className="font-semibold">#{o.invoice_no}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDateTime(o.created_at)}
                    {o.held_at != null ? ' · đơn treo' : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_LABEL[o.status]?.variant ?? 'outline'}>
                    {STATUS_LABEL[o.status]?.label ?? `#${o.status}`}
                  </Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatVnd(o.total)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
