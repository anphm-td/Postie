import { useState } from 'react'
import { BadgePercent, Minus, Plus, Trash2, X } from 'lucide-react'
import { formatVnd, parseDong } from '@renderer/lib/format'
import { MoneyInput } from '@renderer/components/ui/money-input'

export interface CartItemView {
  id: number
  name: string
  priceCents: number
  qty: number
  maxQty: number
  /** Giảm giá theo dòng (P0.5) — chuỗi digits cho MoneyInput, đơn vị đồng. */
  discountDong: string
}

interface CartProps {
  items: CartItemView[]
  discountDong: string
  subtotalCents: number
  lineDiscountCents: number
  discountCents: number
  totalCents: number
  onInc: (id: number) => void
  onDec: (id: number) => void
  onRemove: (id: number) => void
  onDiscountChange: (dong: string) => void
  onLineDiscountChange: (id: number, dong: string) => void
  onClear: () => void
  onPay: () => void
}

export function Cart({
  items,
  discountDong,
  subtotalCents,
  lineDiscountCents,
  discountCents,
  totalCents,
  onInc,
  onDec,
  onRemove,
  onDiscountChange,
  onLineDiscountChange,
  onClear,
  onPay
}: CartProps) {
  const empty = items.length === 0
  const [editingDiscountId, setEditingDiscountId] = useState<number | null>(null)

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">
          Giỏ hàng <span className="font-mono text-muted-foreground">({items.length})</span>
        </span>
        {!empty && (
          <button
            className="text-xs text-destructive transition-colors hover:underline"
            onClick={onClear}
          >
            Xoá giỏ
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-sm text-muted-foreground">
            <p>Chưa có sản phẩm nào.</p>
            <p>Tìm hoặc quét mã vạch để thêm vào giỏ.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((i) => {
              const gross = i.priceCents * i.qty
              const lineDisc = Math.min(gross, parseDong(i.discountDong) * 100)
              const atMax = i.qty >= i.maxQty
              const showDiscount = editingDiscountId === i.id || lineDisc > 0
              return (
                <li key={i.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{i.name}</div>
                      <div className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatVnd(i.priceCents)}
                        {lineDisc > 0 && (
                          <span className="ml-1 font-sans text-emerald-700">-{formatVnd(lineDisc)}</span>
                        )}
                        {atMax && <span className="ml-1 font-sans text-destructive">· tối đa {i.maxQty}</span>}
                      </div>
                    </div>
                    <div className="flex items-center rounded-lg border bg-background">
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        onClick={() => onDec(i.id)}
                        aria-label="Giảm số lượng"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center font-mono text-sm font-semibold tabular-nums">{i.qty}</span>
                      <button
                        className="flex h-7 w-7 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                        onClick={() => onInc(i.id)}
                        disabled={atMax}
                        aria-label="Tăng số lượng"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="w-24 text-right font-mono text-sm font-semibold tabular-nums">
                      {formatVnd(gross - lineDisc)}
                    </div>
                    <button
                      className={
                        editingDiscountId === i.id || lineDisc > 0
                          ? 'text-emerald-700 transition-colors hover:text-emerald-800'
                          : 'text-muted-foreground transition-colors hover:text-foreground'
                      }
                      onClick={() => setEditingDiscountId(editingDiscountId === i.id ? null : i.id)}
                      aria-label={`Giảm giá cho ${i.name}`}
                      title="Giảm giá dòng"
                    >
                      <BadgePercent className="h-4 w-4" />
                    </button>
                    <button
                      className="text-muted-foreground transition-colors hover:text-destructive"
                      onClick={() => onRemove(i.id)}
                      aria-label={`Xoá ${i.name} khỏi giỏ`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {showDiscount && (
                    <div className="mt-1.5 flex items-center justify-end gap-2">
                      <span className="text-xs text-muted-foreground">Giảm giá dòng (₫)</span>
                      <MoneyInput
                        value={i.discountDong}
                        onValueChange={(v) => onLineDiscountChange(i.id, v)}
                        placeholder="0"
                        className="h-7 w-32"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') setEditingDiscountId(null)
                        }}
                        aria-label={`Số tiền giảm giá cho ${i.name}`}
                        autoFocus={editingDiscountId === i.id && lineDisc === 0}
                      />
                      {lineDisc > 0 && (
                        <button
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => onLineDiscountChange(i.id, '')}
                          aria-label={`Xoá giảm giá của ${i.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="bg-card px-4 pb-1 pt-3">
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Tạm tính</span>
            <span className="font-mono tabular-nums">{formatVnd(subtotalCents)}</span>
          </div>
          {lineDiscountCents > 0 && (
            <div className="flex items-center justify-between text-emerald-700">
              <span>Giảm giá dòng</span>
              <span className="font-mono tabular-nums">-{formatVnd(lineDiscountCents)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 text-muted-foreground">
            <span className="shrink-0">Giảm giá đơn (₫)</span>
            <MoneyInput
              value={discountDong}
              onValueChange={onDiscountChange}
              placeholder="0"
              className="h-8 w-32"
              disabled={empty}
              aria-label="Số tiền giảm giá toàn đơn"
            />
          </div>
        </div>
      </div>

      <div aria-hidden className="receipt-tear" />

      <div className="space-y-3 bg-secondary px-4 pb-4 pt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-bold tracking-wide">TỔNG CỘNG</span>
          <span className="font-mono text-2xl font-bold tabular-nums">{formatVnd(totalCents)}</span>
        </div>
        <button
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 py-3 text-base font-bold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={empty}
          onClick={onPay}
        >
          THANH TOÁN
          <kbd className="rounded border border-white/40 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold">
            F9
          </kbd>
        </button>
      </div>
    </div>
  )
}
