// ============================================================================
//  Postie POS - Register (sales) screen
// ============================================================================

import { useCallback, useEffect, useState, useRef } from 'react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { useCart } from '@renderer/hooks/useCart'
import { ProductSearch } from '@renderer/components/pos/ProductSearch'
import { ProductGrid } from '@renderer/components/pos/ProductGrid'
import { Cart, type CartItemView } from '@renderer/components/pos/Cart'
import { PaymentDialog, type CartLineInput } from '@renderer/components/pos/PaymentDialog'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import type { Order, PaymentMethod, Product } from '@shared/types'

function toDiscountCents(dongStr: string, subtotalCents: number): number {
  const dong = Number(dongStr.replace(/[^\d]/g, ''))
  if (!Number.isFinite(dong) || dong < 0) return 0
  return Math.min(subtotalCents, Math.round(dong * 100))
}

// [TÍNH NĂNG MỚI] Định nghĩa type cho Hóa đơn treo
interface HeldBill {
  id: number
  time: string
  items: { product: Product; qty: number }[]
  discountDong: string
}

export function Register() {
  const { user, activeShift } = useAuth()
  const cart = useCart()

  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [discountDong, setDiscountDong] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [payMethod, setPayMethod] = useState<'CASH' | 'QR' | null>(null)
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [lastChange, setLastChange] = useState(0)
  const [loadingProducts, setLoadingProducts] = useState(true)

  // [TÍNH NĂNG MỚI] State cho Treo đơn
  const [heldBills, setHeldBills] = useState<HeldBill[]>([])
  const [showHeldModal, setShowHeldModal] = useState(false)

  const barcodeBuffer = useRef('')
  const lastKeyTime = useRef(0)

  const refreshProducts = useCallback(async () => {
    setLoadingProducts(true)
    try {
      const res = await api.products.list({ activeOnly: true, pageSize: 100 })
      setAllProducts(res.items)
    } finally {
      setLoadingProducts(false)
    }
  }, [])

  useEffect(() => {
    api.payment_methods.list().then(setPaymentMethods).catch(() => setPaymentMethods([]))
    refreshProducts()
  }, [refreshProducts])

  // [TÍNH NĂNG MỚI] Lắng nghe sự kiện quét mã vạch
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Bỏ qua nếu đang gõ vào ô tìm kiếm hoặc form
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const now = Date.now()
      if (now - lastKeyTime.current > 50) {
        barcodeBuffer.current = '' // Không phải máy quét (gõ quá chậm) -> reset
      }
      lastKeyTime.current = now

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length >= 8) {
          const scannedCode = barcodeBuffer.current
          // Tìm sản phẩm (Giả định Product có trường barcode hoặc sku)
          const exact = allProducts.find((p) => p.barcode === scannedCode)
          if (exact) {
            cart.add(exact)
          } else {
            // Có thể thêm thư viện Toast của bạn vào đây (ví dụ: toast.error("Không tìm thấy!"))
            alert(`Không tìm thấy sản phẩm mã: ${scannedCode}`)
          }
        }
        barcodeBuffer.current = ''
      } else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        barcodeBuffer.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allProducts, cart])

  // [TÍNH NĂNG MỚI] Logic Treo đơn
  function holdCurrentBill() {
    if (cart.items.length === 0) return
    const newBill: HeldBill = {
      id: Date.now(),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      items: [...cart.items], // Lưu lại items hiện tại
      discountDong
    }
    setHeldBills((prev) => [...prev, newBill])
    cart.clear()
    setDiscountDong('')
  }

  // [TÍNH NĂNG MỚI] Logic Gọi lại đơn
 // Trong Register.tsx

function restoreBill(bill: HeldBill) {
  if (cart.items.length > 0) {
    alert('Vui lòng thanh toán hoặc treo đơn hiện tại trước khi gọi lại!');
    return;
  }
  cart.setItems(bill.items);
  setDiscountDong(bill.discountDong);
  setHeldBills((prev) => prev.filter((b) => b.id !== bill.id));
  setShowHeldModal(false);
}

  const gridProducts = searching ? results : allProducts
  const discountCents = toDiscountCents(discountDong, cart.subtotalCents)
  const totalCents = Math.max(0, cart.subtotalCents - discountCents)

  function handlePay(method: 'CASH' | 'QR') {
    setPayMethod(method)
  }

  function handlePaid(order: Order, changeCents: number) {
    setLastOrder(order)
    setLastChange(changeCents)
    setPayMethod(null)
    cart.clear()
    setDiscountDong('')
    setResults([])
    setSearching(false)
    refreshProducts()
  }

  const cartItems: CartItemView[] = cart.items.map((i) => ({
    id: i.product.id,
    name: i.product.name,
    priceCents: i.product.price,
    qty: i.qty,
    maxQty: i.product.stock
  }))

  const payLines: CartLineInput[] = cart.items.map((i) => ({
    product_id: i.product.id,
    quantity: i.qty,
    unit_price: i.product.price
  }))

  return (
    <div className="flex h-full flex-col relative">
      {/* Shift info bar */}
      <div className="border-b bg-card px-6 py-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="font-semibold">{user?.display_name}</span>
            <span className="text-muted-foreground">
              Ca mở lúc: <b className="text-foreground">{activeShift ? formatDateTime(activeShift.opened_at) : '—'}</b>
            </span>
            <span className="text-muted-foreground">
              Tiền đầu ca: <b className="text-foreground">{activeShift ? formatVnd(activeShift.opening_cash) : '—'}</b>
            </span>
          </div>
          <h1 className="text-lg font-semibold">Bán hàng</h1>
        </div>
      </div>

      {/* Two-panel workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: search + grid */}
        <div className="flex flex-1 flex-col border-r">
          <div className="p-3">
            <ProductSearch
              onResults={(items, s) => {
                setResults(items)
                setSearching(s)
              }}
              onAddToCart={cart.add}
            />
          </div>
          {loadingProducts ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Đang tải sản phẩm…
            </div>
          ) : (
            <ProductGrid products={gridProducts} onAdd={cart.add} />
          )}
        </div>

        {/* Right: cart */}
        <div className="w-[380px] shrink-0 bg-background flex flex-col">
          
          {/* [TÍNH NĂNG MỚI] Khu vực nút Treo/Gọi đơn đặt ngay trên Giỏ hàng */}
          <div className="p-3 border-b border-dashed flex items-center justify-between bg-muted/30">
             <Button 
                variant="outline" 
                size="sm"
                disabled={cart.items.length === 0} 
                onClick={holdCurrentBill}
                className="text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700"
             >
                ⏸ Treo đơn này
             </Button>

             {heldBills.length > 0 && (
                <Button 
                  variant="default"
                  size="sm"
                  onClick={() => setShowHeldModal(true)}
                  className="bg-amber-500 hover:bg-amber-600 text-white animate-pulse"
                >
                  Có {heldBills.length} đơn treo
                </Button>
             )}
          </div>

          <div className="flex-1 overflow-hidden">
            <Cart
              items={cartItems}
              discountDong={discountDong}
              subtotalCents={cart.subtotalCents}
              discountCents={discountCents}
              totalCents={totalCents}
              onInc={cart.inc}
              onDec={cart.dec}
              onRemove={cart.remove}
              onDiscountChange={setDiscountDong}
              onClear={() => {
                cart.clear()
                setDiscountDong('')
              }}
              onPay={handlePay}
            />
          </div>
        </div>
      </div>

      {/* [TÍNH NĂNG MỚI] Modal hiển thị Đơn treo */}
      {showHeldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>Hóa đơn đang chờ ({heldBills.length})</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setShowHeldModal(false)}>✕</Button>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[60vh] overflow-y-auto">
              {heldBills.map((bill) => (
                <div key={bill.id} className="flex items-center justify-between p-3 border rounded-lg hover:border-amber-400 transition-colors">
                  <div>
                    <div className="font-semibold text-sm">Treo lúc: {bill.time}</div>
                    <div className="text-xs text-muted-foreground">{bill.items.length} mặt hàng</div>
                  </div>
                  <Button size="sm" onClick={() => restoreBill(bill)}>
                    Gọi lại
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {payMethod && user && (
        <PaymentDialog
          open={payMethod !== null}
          method={payMethod}
          paymentMethods={paymentMethods}
          totalCents={totalCents}
          lines={payLines}
          discountCents={discountCents}
          userId={user.id}
          shiftId={activeShift?.id ?? null}
          onClose={() => setPayMethod(null)}
          onPaid={handlePaid}
        />
      )}

      {/* Success receipt card (Giữ nguyên) */}
      {lastOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <Card className="w-full max-w-sm">
            <CardContent className="space-y-4 p-6 text-center">
              <div className="text-3xl">✅</div>
              <h2 className="text-xl font-semibold">Thanh toán thành công</h2>
              <div className="space-y-1 text-sm">
                <div>
                  Hóa đơn <b>#{lastOrder.invoice_no}</b>
                </div>
                <div>
                  Tổng tiền: <b>{formatVnd(lastOrder.total)}</b>
                </div>
                {lastChange > 0 && (
                  <div className="text-emerald-600">
                    Tiền thối: <b>{formatVnd(lastChange)}</b>
                  </div>
                )}
              </div>
              <Button className="w-full" onClick={() => setLastOrder(null)}>
                Đơn mới
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}