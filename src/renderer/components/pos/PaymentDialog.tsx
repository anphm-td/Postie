// ============================================================================
//  Dialog thanh toán ĐA KÊNH (P0.1 + P1.6 — docs/kiotviet-roadmap.md §5)
// ----------------------------------------------------------------------------
//  * Split-tender: danh sách dòng thanh toán (CASH / CARD / QR — từ bảng
//    payment_methods), mỗi dòng nhập số tiền riêng; tự tính "còn lại" /
//    "tiền thối lại". orders.create / orders.convertHeld đã nhận mảng
//    payments (order_payments hỗ trợ split-tender sẵn trong schema).
//  * QR VietQR tĩnh (stub — bước 1 khả thi offline): gọi
//    orders.buildVietQRPayload để có chuỗi EMVCo rồi vẽ hình QR bằng thư
//    viện `qrcode`. Webhook ngân hàng tự đối soát (bước 2) ngoài phạm vi.
//  * Đơn treo: khi có heldOrder, xác nhận = MỘT lệnh orders.convertHeld kèm
//    giỏ hiện tại (items + giảm giá) — nhận tiền + trừ tồn + thay snapshot
//    trong cùng transaction. Không gọi updateHeld riêng trước nữa: nếu nhận
//    tiền thất bại (vd hết hàng) thì snapshot đơn treo phải giữ nguyên.
// ============================================================================

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Banknote, CreditCard, Loader2, Plus, QrCode, Trash2, Wallet } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { dongToCents, formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { MoneyInput } from '@renderer/components/ui/money-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@renderer/components/ui/dialog'
import type { CreateOrderInput, Customer, Order, OrderPaymentInput, PaymentMethod } from '@shared/types'
import { isQrConfigured, type StoreConfig } from './storeConfig'

export interface CartLineInput {
  product_id: number
  quantity: number
  unit_price: number
  /** Giảm giá theo dòng (cents) — snapshot vào order_details.discount_amount. */
  discount_amount?: number
}

interface PayEntry {
  methodId: number
  code: string
  name: string
  amountDong: string
}

interface PaymentDialogProps {
  open: boolean
  paymentMethods: PaymentMethod[]
  /** Cấu hình cửa hàng (BIN + STK cho QR) — thay đổi từ StoreConfigDialog. */
  storeConfig: StoreConfig
  totalCents: number
  lines: CartLineInput[]
  /** Giảm giá toàn đơn (cents). */
  discountCents: number
  userId: number
  shiftId: number | null
  customer: Customer | null
  /** Đang thanh toán đơn treo → xác nhận = convertHeld (kèm giỏ hiện tại). */
  heldOrder: { id: number; invoice_no: number } | null
  /** Mở dialog cấu hình khi chưa có thông tin nhận QR. */
  onRequestConfigure: () => void
  onClose: () => void
  onPaid: (order: Order, changeCents: number) => void
}

const quickAmounts = [10000, 20000, 50000, 100000, 200000, 500000]

function MethodIcon({ code }: { code: string }) {
  if (code === 'CASH') return <Banknote className="h-5 w-5 shrink-0 text-emerald-700" />
  if (code === 'CARD') return <CreditCard className="h-5 w-5 shrink-0 text-indigo-700" />
  if (code === 'QR') return <QrCode className="h-5 w-5 shrink-0 text-sky-700" />
  return <Wallet className="h-5 w-5 shrink-0 text-muted-foreground" />
}

export function PaymentDialog({
  open,
  paymentMethods,
  storeConfig,
  totalCents,
  lines,
  discountCents,
  userId,
  shiftId,
  customer,
  heldOrder,
  onRequestConfigure,
  onClose,
  onPaid
}: PaymentDialogProps) {
  const [entries, setEntries] = useState<PayEntry[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrBuilding, setQrBuilding] = useState(false)
  /** Nội dung chuyển khoản in kèm QR: #số_hóa_đơn (đơn treo có sẵn; đơn mới dự đoán max+1). */
  const [qrDescription, setQrDescription] = useState('')

  // Mở dialog: mặc định 1 dòng tiền mặt với số tiền bằng đúng tổng phải thu.
  useEffect(() => {
    if (!open) return
    setError(null)
    setSubmitting(false)
    setQrDataUrl(null)
    const cash =
      paymentMethods.find((m) => m.code === 'CASH' && m.is_active === 1) ??
      paymentMethods.find((m) => m.is_active === 1)
    setEntries(
      cash
        ? [{ methodId: cash.id, code: cash.code, name: cash.name, amountDong: String(Math.max(0, Math.floor(totalCents / 100))) }]
        : []
    )
    // Dự đoán số hóa đơn cho nội dung CK: app offline 1 quầy nên lấy max hiện có + 1.
    let cancelled = false
    api.orders
      .listRecent(30)
      .then((recent) => {
        if (cancelled) return
        const maxNo = recent.reduce((m, o) => Math.max(m, o.invoice_no), 0)
        setQrDescription(heldOrder ? `#${heldOrder.invoice_no}` : `#${maxNo + 1}`)
      })
      .catch(() => {
        if (!cancelled) setQrDescription(heldOrder ? `#${heldOrder.invoice_no}` : 'POSTIE')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const paidCents = entries.reduce((s, e) => s + dongToCents(e.amountDong), 0)
  const remainingCents = totalCents - paidCents
  const changeCents = Math.max(0, paidCents - totalCents)
  const creditRemaining = remainingCents > 0 && !!customer
  const canConfirm = remainingCents <= 0 || creditRemaining
  const qrEntry = entries.find((e) => e.code === 'QR')

  // Vẽ hình QR cho dòng QR (debounce nhẹ khi gõ số tiền).
  useEffect(() => {
    if (!open || !qrEntry || !isQrConfigured(storeConfig)) {
      setQrDataUrl(null)
      return
    }
    const amountCents = dongToCents(qrEntry.amountDong)
    if (amountCents <= 0) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    setQrBuilding(true)
    const t = window.setTimeout(async () => {
      try {
        const payload = await api.orders.buildVietQRPayload({
          bankBin: storeConfig.qr_bank_bin.trim(),
          accountNo: storeConfig.qr_account_no.replace(/\s+/g, ''),
          amount_cents: amountCents,
          description: qrDescription || undefined
        })
        const url = await QRCode.toDataURL(payload, { width: 240, margin: 1 })
        if (!cancelled) setQrDataUrl(url)
      } catch (err) {
        if (!cancelled) {
          setQrDataUrl(null)
          setError(err instanceof Error ? err.message : 'Không tạo được mã QR.')
        }
      } finally {
        if (!cancelled) setQrBuilding(false)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, qrEntry?.methodId, qrEntry?.amountDong, storeConfig, qrDescription])

  function updateEntry(methodId: number, dong: string) {
    setEntries((prev) => prev.map((e) => (e.methodId === methodId ? { ...e, amountDong: dong } : e)))
  }

  function removeEntry(methodId: number) {
    setEntries((prev) => prev.filter((e) => e.methodId !== methodId))
  }

  function addMethod(m: PaymentMethod) {
    setEntries((prev) => [
      ...prev,
      {
        methodId: m.id,
        code: m.code,
        name: m.name,
        amountDong: remainingCents > 0 ? String(Math.floor(remainingCents / 100)) : '0'
      }
    ])
  }

  function addQuick(methodId: number, dong: number) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.methodId !== methodId) return e
        const cur = parseInt(e.amountDong || '0', 10) || 0
        return { ...e, amountDong: String(cur + dong) }
      })
    )
  }

  /** Đẩy dòng tiền mặt lên đúng phần còn lại. */
  function coverWithCash(methodId: number) {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.methodId !== methodId) return e
        const cur = dongToCents(e.amountDong)
        const need = Math.max(0, totalCents - cur)
        return { ...e, amountDong: String(Math.floor((cur + need) / 100)) }
      })
    )
  }

  async function handleConfirm() {
    setError(null)
    const payments: OrderPaymentInput[] =
      totalCents === 0
        ? []
        : entries
            .map((e) => ({
              payment_method_id: e.methodId,
              amount: dongToCents(e.amountDong),
              ...(e.code === 'QR' && qrDescription ? { reference: qrDescription } : {})
            }))
            .filter((p) => p.amount > 0)
    const paidServer = payments.reduce((s, p) => s + p.amount, 0)
    if (totalCents - paidServer > 0 && !customer) {
      setError('Tiền chưa đủ và chưa gắn khách hàng — không thể bán chịu.')
      return
    }
    setSubmitting(true)
    try {
      let order: Order
      if (heldOrder) {
        // Đơn treo: MỘT lệnh convertHeld làm tất cả trong 1 transaction —
        // thay giỏ + nhận tiền + trừ tồn. Nếu trừ tồn thất bại (hết hàng…)
        // thì cả cụm rollback, snapshot đơn treo giữ nguyên bản gốc.
        // apply_promotions: false — mức giảm nạp về giỏ lúc gọi đơn treo đã
        // GỘM khuyến mại chốt lúc treo; chạy lại engine sẽ nhân đôi giảm giá.
        order = await api.orders.convertHeld(heldOrder.id, {
          payments,
          user_id: userId,
          shift_id: shiftId,
          items: lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
            tax_rate: 0,
            discount_amount: l.discount_amount ?? 0
          })),
          customer_id: customer?.id ?? null,
          discount_amount: discountCents,
          apply_promotions: false
        })
      } else {
        const input: CreateOrderInput = {
          user_id: userId,
          customer_id: customer?.id ?? null,
          shift_id: shiftId,
          items: lines.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
            tax_rate: 0,
            discount_amount: l.discount_amount ?? 0
          })),
          payments,
          discount_amount: discountCents
        }
        order = await api.orders.create(input)
      }
      onPaid(order, Math.max(0, paidServer - totalCents))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được hóa đơn. Thử lại nhé.')
    } finally {
      setSubmitting(false)
    }
  }

  const availableMethods = paymentMethods.filter(
    (m) => m.is_active === 1 && !entries.some((e) => e.methodId === m.id)
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            {heldOrder ? `Thanh toán đơn treo #${heldOrder.invoice_no}` : 'Thanh toán'}
          </DialogTitle>
          <DialogDescription>
            Kết hợp nhiều phương thức trong một hóa đơn — hệ thống tự tính còn lại và tiền thối.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-secondary px-4 py-3 text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Tổng tiền phải thu
          </div>
          <div className="font-mono text-3xl font-bold tabular-nums">{formatVnd(totalCents)}</div>
        </div>

        <div className="space-y-2">
          {entries.map((e, idx) => (
            <div key={e.methodId} className="rounded-lg border p-2.5">
              <div className="flex items-center gap-2">
                <MethodIcon code={e.code} />
                <span className="w-24 shrink-0 truncate text-sm font-semibold">{e.name}</span>
                <MoneyInput
                  value={e.amountDong}
                  onValueChange={(v) => updateEntry(e.methodId, v)}
                  placeholder="0"
                  className="h-10 flex-1 text-base"
                  autoFocus={idx === 0}
                  aria-label={`Số tiền ${e.name}`}
                />
                {entries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeEntry(e.methodId)}
                    aria-label={`Bỏ ${e.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {e.code === 'CASH' && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {quickAmounts.map((d) => (
                    <button
                      key={d}
                      onClick={() => addQuick(e.methodId, d)}
                      className="rounded-md border bg-background px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      +{d / 1000}k
                    </button>
                  ))}
                  <button
                    onClick={() => coverWithCash(e.methodId)}
                    className="rounded-md border border-primary bg-primary/5 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-primary transition-colors hover:bg-primary/10"
                  >
                    Đủ tiền
                  </button>
                </div>
              )}
            </div>
          ))}

          {entries.length === 0 && totalCents > 0 && (
            <p className="text-xs leading-relaxed text-destructive">
              Chưa có phương thức thanh toán nào. Kiểm tra dữ liệu ban đầu (payment_methods).
            </p>
          )}

          {availableMethods.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Thêm:</span>
              {availableMethods.map((m) => (
                <Button key={m.id} variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => addMethod(m)}>
                  <Plus className="h-3.5 w-3.5" />
                  {m.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {qrEntry && (
          <div className="rounded-xl border border-sky-200 bg-sky-500/5 p-3">
            {isQrConfigured(storeConfig) ? (
              qrDataUrl ? (
                <div className="flex items-center gap-3">
                  <img src={qrDataUrl} alt="Mã QR VietQR" className="h-36 w-36 shrink-0 rounded border bg-white" />
                  <div className="text-xs leading-relaxed text-muted-foreground">
                    <div>
                      Nội dung CK: <b className="font-mono text-foreground">{qrDescription}</b>
                    </div>
                    <div>
                      Số tiền:{' '}
                      <b className="font-mono text-foreground">{formatVnd(dongToCents(qrEntry.amountDong))}</b>
                    </div>
                    <div className="mt-1">
                      Khách quét QR chuyển khoản, sau khi thấy tiền về thì nhấn{' '}
                      <b className="text-foreground">Xác nhận thanh toán</b>.
                    </div>
                    <div className="mt-1 italic">(Stub — chưa tự đối soát tiền về qua ngân hàng)</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {qrBuilding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang tạo mã QR…
                    </>
                  ) : (
                    'Nhập số tiền cho dòng QR để tạo mã.'
                  )}
                </div>
              )
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Chưa cấu hình tài khoản nhận QR (BIN ngân hàng + số tài khoản).
                </p>
                <Button size="sm" variant="outline" onClick={onRequestConfigure}>
                  Cấu hình
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          {remainingCents > 0 ? (
            <div className="flex justify-between rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
              <span className="text-amber-800">Còn lại</span>
              <span className="font-mono font-bold tabular-nums text-amber-800">{formatVnd(remainingCents)}</span>
            </div>
          ) : changeCents > 0 ? (
            <div className="flex justify-between rounded-lg bg-emerald-500/10 px-3 py-2 text-sm">
              <span className="text-emerald-800">Tiền thối lại khách</span>
              <span className="font-mono font-bold tabular-nums text-emerald-800">{formatVnd(changeCents)}</span>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/60 px-3 py-2 text-center text-sm text-muted-foreground">
              Đã đủ tiền
            </div>
          )}
          {creditRemaining && customer && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800">
              Ghi nợ phần còn lại <b className="font-mono">{formatVnd(remainingCents)}</b> cho khách{' '}
              <b>{customer.name}</b>.
            </p>
          )}
        </div>

        {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || submitting}>
            {submitting
              ? 'Đang xử lý…'
              : creditRemaining
                ? 'Xác nhận & ghi nợ phần còn lại'
                : 'Xác nhận thanh toán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
