// ============================================================================
//  Postie POS - Cart (Register, right panel)
// ----------------------------------------------------------------------------
//  Lists cart items with quantity steppers (clamped to stock), a per-order
//  discount field (entered in đồng), and a running total. The two checkout
//  buttons surface the payment method to the parent, which opens the payment
//  dialog. All money passed in/out is cents; the discount input is in đồng.
// ============================================================================

import { Minus, Plus, Trash2 } from 'lucide-react'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'

export interface CartItemView {
  id: number
  name: string
  priceCents: number
  qty: number
  maxQty: number
}

interface CartProps {
  items: CartItemView[]
  discountDong: string
  subtotalCents: number
  discountCents: number
  totalCents: number
  onInc: (id: number) => void
  onDec: (id: number) => void
  onRemove: (id: number) => void
  onDiscountChange: (dong: string) => void
  onClear: () => void
  onPay: (method: 'CASH' | 'QR') => void
}

export function Cart({
  items,
  discountDong,
  subtotalCents,
  discountCents,
  totalCents,
  onInc,
  onDec,
  onRemove,
  onDiscountChange,
  onClear,
  onPay
}: CartProps) {
  const empty = items.length === 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-3">
        <span className="font-semibold">Giỏ hàng ({items.length} món)</span>
        {!empty && (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onClear}>
            Xóa giỏ
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Chưa có sản phẩm.
            <br />
            Tìm hoặc quét mã vạch để thêm vào giỏ.
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((i) => {
              const lineTotal = i.priceCents * i.qty
              const atMax = i.qty >= i.maxQty
              return (
                <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatVnd(i.priceCents)}
                      {atMax && <span className="ml-1 text-destructive">· tối đa {i.maxQty}</span>}
                    </div>
                  </div>
                  <div className="flex items-center rounded-md border">
                    <button
                      className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => onDec(i.id)}
                      aria-label="Giảm số lượng"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold">{i.qty}</span>
                    <button
                      className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                      onClick={() => onInc(i.id)}
                      disabled={atMax}
                      aria-label="Tăng số lượng"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="w-24 text-right text-sm font-semibold">{formatVnd(lineTotal)}</div>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => onRemove(i.id)}
                    aria-label="Xóa sản phẩm"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t bg-muted/40 p-4">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Tạm tính</span>
            <span>{formatVnd(subtotalCents)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Giảm giá (₫)</span>
            <Input
              inputMode="numeric"
              value={discountDong}
              onChange={(e) => onDiscountChange(e.target.value)}
              placeholder="0"
              className="h-8 w-32 text-right"
              disabled={empty}
            />
          </div>
          <div className="flex justify-between border-t pt-2 text-xl font-bold">
            <span>TỔNG CỘNG</span>
            <span>{formatVnd(totalCents)}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            disabled={empty}
            onClick={() => onPay('CASH')}
          >
            💵 Tiền mặt
          </Button>
          <Button
            className="bg-sky-600 text-white hover:bg-sky-700"
            disabled={empty}
            onClick={() => onPay('QR')}
          >
            📱 QR
          </Button>
        </div>
      </div>
    </div>
  )
}
