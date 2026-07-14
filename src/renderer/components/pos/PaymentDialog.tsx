// ============================================================================
//  Postie POS - Payment dialog (Register)
// ----------------------------------------------------------------------------
//  Opens when the cashier picks a tender (Cash / QR). For cash, the cashier
//  enters the amount tendered and sees the change due; the amount must cover
//  the total. For QR, the total is simply confirmed. On confirm, builds a
//  CreateOrderInput (tax_rate 0 per line) and calls api.orders.create, which
//  atomically records the invoice, decrements stock, and stores the payment.
//  Success shows the invoice number + change; failure surfaces the error.
// ============================================================================

import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'
import type { CreateOrderInput, Order, PaymentMethod } from '@shared/types'

export interface CartLineInput {
  product_id: number
  quantity: number
  unit_price: number
}

interface PaymentDialogProps {
  open: boolean
  method: 'CASH' | 'QR'
  paymentMethods: PaymentMethod[]
  totalCents: number
  lines: CartLineInput[]
  discountCents: number
  userId: number
  shiftId: number | null
  onClose: () => void
  /** Called with the created order and the change due (0 for QR / exact cash). */
  onPaid: (order: Order, changeCents: number) => void
}

function toCents(dongStr: string): number {
  const dong = Number(dongStr.replace(/[^\d]/g, ''))
  return Number.isFinite(dong) && dong >= 0 ? Math.round(dong * 100) : 0
}

export function PaymentDialog({
  open,
  method,
  paymentMethods,
  totalCents,
  lines,
  discountCents,
  userId,
  shiftId,
  onClose,
  onPaid
}: PaymentDialogProps) {
  const [tenderedDong, setTenderedDong] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset input whenever the dialog opens or the method/total changes.
  useEffect(() => {
    if (open) {
      setTenderedDong('')
      setError(null)
      setSubmitting(false)
    }
  }, [open, method, totalCents])

  const tenderedCents = method === 'CASH' ? toCents(tenderedDong) : totalCents
  const changeCents = tenderedCents - totalCents
  const cashShort = method === 'CASH' && tenderedCents < totalCents
  const pm = paymentMethods.find((m) => m.code === method)

  async function handleConfirm() {
    setError(null)
    if (!pm) {
      setError('Không tìm thấy phương thức thanh toán.')
      return
    }
    if (cashShort) {
      setError('Tiền khách đưa không đủ.')
      return
    }
    setSubmitting(true)
    const input: CreateOrderInput = {
      user_id: userId,
      shift_id: shiftId,
      items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate: 0
      })),
      payments: [{ payment_method_id: pm.id, amount: totalCents }],
      discount_amount: discountCents
    }
    try {
      const order = await api.orders.create(input)
      onPaid(order, Math.max(0, changeCents))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo đơn.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{method === 'CASH' ? 'Thanh toán tiền mặt' : 'Thanh toán QR'}</DialogTitle>
          <DialogDescription>
            Tổng tiền phải thu: <b className="text-foreground">{formatVnd(totalCents)}</b>
          </DialogDescription>
        </DialogHeader>

        {method === 'CASH' && (
          <div className="space-y-2">
            <Label htmlFor="tendered">Tiền khách đưa (₫)</Label>
            <Input
              id="tendered"
              inputMode="numeric"
              value={tenderedDong}
              onChange={(e) => setTenderedDong(e.target.value)}
              placeholder={String(totalCents / 100)}
              autoFocus
            />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tiền thối lại</span>
              <span className={changeCents < 0 ? 'font-semibold text-destructive' : 'font-semibold'}>
                {formatVnd(Math.max(0, changeCents))}
              </span>
            </div>
          </div>
        )}
        {method === 'QR' && (
          <div className="rounded-md border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            Khách quét mã QR chuyển khoản đúng số tiền{' '}
            <b className="text-foreground">{formatVnd(totalCents)}</b>, sau đó nhấn xác nhận.
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || cashShort}>
            {submitting ? 'Đang xử lý…' : 'Xác nhận thanh toán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
