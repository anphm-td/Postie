import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, CheckCheck, PackageCheck, XCircle } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { dongToCents, formatVnd, formatDateTime } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { MoneyInput } from '@renderer/components/ui/money-input'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
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
import { SupplierPaymentDialog } from '@renderer/components/inventory/SupplierPaymentDialog'
import { PO_STATUS_META } from '@renderer/components/inventory/labels'
import type { PurchaseOrder } from '@shared/types'

interface PurchaseDetailDialogProps {
  po: PurchaseOrder | null
  userId: number
  onClose: () => void
  onUpdated: () => void
}

/**
 * CHI TIẾT PHIẾU NHẬP + NHẬN HÀNG (P1.2 — purchases:receive / cancel):
 *  - Nhận một phần/đủ, nhiều lần: mỗi lần = 1 transaction trong repo (movements
 *    type=2 + UPDATE products.cost + supplier_ledger + tự hoàn tất phiếu).
 *  - Hủy phiếu: chỉ khi chưa nhận hàng gì (repo chặn), dùng status=2.
 *  - Trả tiền NCC: mở SupplierPaymentDialog đối chiếu poId.
 */
export function PurchaseDetailDialog({ po, userId, onClose, onUpdated }: PurchaseDetailDialogProps) {
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [receivedMap, setReceivedMap] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [recvQty, setRecvQty] = useState<Record<number, string>>({})
  const [paidDong, setPaidDong] = useState('')
  const [receiving, setReceiving] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [showPay, setShowPay] = useState(false)

  const open = po !== null

  const load = useCallback(async (poId: number) => {
    setLoading(true)
    try {
      const [full, received] = await Promise.all([
        api.purchases.getById(poId),
        api.purchases.getReceivedLines(poId)
      ])
      setOrder(full ?? null)
      setReceivedMap(new Map(received.map((r) => [r.product_id, r.received_qty])))
      if (full) {
        const orderedPerProduct = new Map<number, number>()
        for (const d of full.details ?? []) {
          orderedPerProduct.set(d.product_id, (orderedPerProduct.get(d.product_id) ?? 0) + d.qty)
        }
        const next: Record<number, string> = {}
        for (const d of full.details ?? []) {
          const remaining = Math.max(
            0,
            (orderedPerProduct.get(d.product_id) ?? 0) - (received.find((r) => r.product_id === d.product_id)?.received_qty ?? 0)
          )
          next[d.id] = remaining > 0 ? String(remaining) : '0'
        }
        setRecvQty(next)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (po) void load(po.id)
    else {
      setOrder(null)
      setReceivedMap(new Map())
      setRecvQty({})
      setPaidDong('')
    }
  }, [po, load])

  function fillAllRemaining() {
    if (!order) return
    const orderedPerProduct = new Map<number, number>()
    for (const d of order.details ?? []) {
      orderedPerProduct.set(d.product_id, (orderedPerProduct.get(d.product_id) ?? 0) + d.qty)
    }
    const next: Record<number, string> = {}
    for (const d of order.details ?? []) {
      const remaining = Math.max(
        0,
        (orderedPerProduct.get(d.product_id) ?? 0) - (receivedMap.get(d.product_id) ?? 0)
      )
      next[d.id] = String(remaining)
    }
    setRecvQty(next)
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault()
    if (!order) return
    const lines = (order.details ?? [])
      .map((d) => ({ detail_id: d.id, qty: Number((recvQty[d.id] ?? '0').trim() || '0') }))
      .filter((l) => l.qty > 0)
    if (lines.length === 0) {
      toast.error('Nhập số lượng nhận cho ít nhất một dòng (0 = bỏ qua dòng đó).')
      return
    }
    const paid = dongToCents(paidDong)
    setReceiving(true)
    try {
      const updated = await api.purchases.receive({
        po_id: order.id,
        lines,
        paid: paid > 0 ? paid : undefined,
        created_by: userId
      })
      toast.success(
        updated.status === 1
          ? `Đã nhận đủ phiếu #${order.id} — tồn kho và công nợ đã được ghi sổ.`
          : `Đã nhận một phần phiếu #${order.id}.`
      )
      setPaidDong('')
      await load(order.id)
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không nhận được hàng.')
    } finally {
      setReceiving(false)
    }
  }

  async function handleCancel() {
    if (!order) return
    setShowCancel(false)
    try {
      await api.purchases.cancel(order.id)
      toast.success(`Đã hủy phiếu nhập #${order.id}.`)
      await load(order.id)
      onUpdated()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không hủy được phiếu.')
    }
  }

  const statusMeta = order ? PO_STATUS_META[order.status] : null
  const canReceive = order?.status === 0

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-5 w-5 text-primary" />
              Phiếu nhập #{order?.id ?? '…'}
              {statusMeta && (
                <Badge className={statusMeta.badge} variant="secondary">
                  {statusMeta.label}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {order
                ? `${order.supplier_name} · Tạo ${formatDateTime(order.created_at)} · Tổng ${formatVnd(order.total)} · Đã trả ${formatVnd(order.paid)}`
                : 'Đang tải…'}
            </DialogDescription>
          </DialogHeader>

          {loading && !order ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : order ? (
            <>
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Sản phẩm</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Đặt</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Đã nhận</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Đơn giá</th>
                      {canReceive && <th className="w-24 px-3 py-2 font-medium">Nhận lần này</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(order.details ?? []).map((d) => {
                      const received = receivedMap.get(d.product_id) ?? 0
                      const done = received >= d.qty
                      return (
                        <tr key={d.id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <p className="truncate font-medium" title={d.product_name}>
                              {d.product_name}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {d.barcode || `#${d.product_id}`}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums">{d.qty}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={done ? 'font-mono font-semibold text-emerald-700' : 'font-mono tabular-nums'}>
                              {received}
                            </span>
                            {done && d.qty > 0 && <span className="ml-1 text-emerald-700">✓</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">
                            {formatVnd(d.cost)}
                          </td>
                          {canReceive && (
                            <td className="px-3 py-2">
                              <Input
                                value={recvQty[d.id] ?? '0'}
                                onChange={(e) =>
                                  setRecvQty((prev) => ({
                                    ...prev,
                                    [d.id]: e.target.value.replace(/\D/g, '').slice(0, 6)
                                  }))
                                }
                                inputMode="numeric"
                                className="h-8 text-right"
                                aria-label={`Nhận ${d.product_name}`}
                              />
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {order.note && (
                <p className="text-sm text-muted-foreground">Ghi chú: {order.note}</p>
              )}

              {canReceive && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Nhận hàng từ NCC</p>
                    <Button type="button" variant="outline" size="sm" onClick={fillAllRemaining}>
                      <CheckCheck className="mr-1 h-4 w-4" />
                      Nhận đủ phần còn lại
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="recv-paid">Trả thêm tiền NCC lần này (₫, tùy chọn)</Label>
                    <MoneyInput id="recv-paid" value={paidDong} onValueChange={setPaidDong} placeholder="0" />
                  </div>
                  <Button onClick={handleReceive} disabled={receiving} className="w-full">
                    <PackageCheck className="mr-1 h-4 w-4" />
                    Xác nhận nhận hàng
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Khi nhận: tồn kho tăng (stock_movements type=2), giá vốn cập nhật theo đơn giá
                    phiếu, công nợ NCC ghi theo giá trị đã nhận. Nhập 0 để bỏ qua dòng.
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">Không tìm thấy phiếu nhập.</p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {order && order.status !== 2 && (
              <Button
                type="button"
                variant="outline"
                className="mr-auto text-emerald-700 hover:text-emerald-800"
                onClick={() => setShowPay(true)}
              >
                <Banknote className="mr-1 h-4 w-4" />
                Trả tiền NCC
              </Button>
            )}
            {canReceive && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setShowCancel(true)}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Hủy phiếu
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hủy phiếu — chỉ khi chưa nhận hàng (repo chặn phía sau) */}
      <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy phiếu nhập #{order?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ hủy được phiếu chưa nhận hàng gì. Tiền đã trả trước (cọc) không tự hoàn — sẽ xử lý
              qua điều chỉnh công nợ NCC.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ phiếu</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancel}
            >
              Hủy phiếu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trả tiền NCC đối chiếu phiếu này */}
      {order && (
        <SupplierPaymentDialog
          supplier={{ id: order.supplier_id, name: order.supplier_name ?? `NCC #${order.supplier_id}` }}
          poId={order.id}
          userId={userId}
          onClose={() => setShowPay(false)}
          onSaved={() => {
            void load(order.id)
            onUpdated()
          }}
        />
      )}
    </>
  )
}
