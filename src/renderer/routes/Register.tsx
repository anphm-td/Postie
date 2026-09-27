// ============================================================================
//  Màn Bán hàng (Register) — hiện thực P0.1–P0.5 + P1.5/P1.6 theo
//  docs/kiotviet-roadmap.md:
//    * Hotkey F2 (thêm hàng nhanh) / F4 (chọn khách) / F9 (thanh toán).
//    * Quét mã vạch: toast sonner + âm báo lỗi thay alert().
//    * Giảm giá theo từng dòng trong giỏ (order_details.discount_amount).
//    * Thanh toán đa kênh: PaymentDialog đa dòng (CASH/CARD/QR) + VietQR tĩnh.
//    * Đơn treo xuống DB (orders.hold/updateHeld/convertHeld/listHeld) —
//      không còn useState mất khi restart.
//    * Hủy đơn (orders:voidOrder) + in lại hóa đơn trong "Đơn gần đây".
//    * In hóa đơn 80mm sau thanh toán (template HTML + window.print()).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CircleCheckBig, History, PackagePlus, Printer, ScanBarcode, Settings2 } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { dongToCents, formatDateTime, formatVnd, parseDong } from '@renderer/lib/format'
import { useCart } from '@renderer/hooks/useCart'
import { ProductSearch } from '@renderer/components/pos/ProductSearch'
import { ProductGrid } from '@renderer/components/pos/ProductGrid'
import { Cart, type CartItemView } from '@renderer/components/pos/Cart'
import { CustomerPicker } from '@renderer/components/pos/CustomerPicker'
import { HeldBillsBar, HeldBillsDialog } from '@renderer/components/pos/HeldBills'
import { PaymentDialog, type CartLineInput } from '@renderer/components/pos/PaymentDialog'
import { QuickAddDialog } from '@renderer/components/pos/QuickAddDialog'
import { RecentOrdersDialog } from '@renderer/components/pos/RecentOrdersDialog'
import { StoreConfigDialog } from '@renderer/components/pos/StoreConfigDialog'
import { beep } from '@renderer/components/pos/sound'
import { loadStoreConfig, type StoreConfig } from '@renderer/components/pos/storeConfig'
import { printReceipt } from '@renderer/components/pos/receipt'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Skeleton } from '@renderer/components/ui/skeleton'
import type { Customer, HeldBill, Order, PaymentMethod, Product } from '@shared/types'

/** Đơn treo đang mở trong giỏ (để updateHeld/convertHeld thay vì tạo đơn mới). */
interface EditingHeld {
  id: number
  invoice_no: number
}

export function Register() {
  const { user, activeShift } = useAuth()
  const cart = useCart()

  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])

  const [discountDong, setDiscountDong] = useState('')
  const [lineDiscounts, setLineDiscounts] = useState<Record<number, string>>({})
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const [payOpen, setPayOpen] = useState(false)
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [lastChange, setLastChange] = useState(0)

  const [heldBills, setHeldBills] = useState<HeldBill[]>([])
  const [showHeldModal, setShowHeldModal] = useState(false)
  const [editingHeld, setEditingHeld] = useState<EditingHeld | null>(null)
  const [heldBusyId, setHeldBusyId] = useState<number | null>(null)

  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(() => loadStoreConfig())

  const customerInputRef = useRef<HTMLInputElement>(null)
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

  const refreshHeld = useCallback(async () => {
    try {
      setHeldBills(await api.orders.listHeld(50))
    } catch {
      /* bỏ qua — danh sách đơn treo không chặn việc bán */
    }
  }, [])

  useEffect(() => {
    api.payment_methods.list().then(setPaymentMethods).catch(() => setPaymentMethods([]))
    void refreshProducts()
  }, [refreshProducts])

  useEffect(() => {
    void refreshHeld()
  }, [refreshHeld])

  // ---------------------------------------------------------------------------
  // Hotkeys: F2 thêm hàng nhanh · F4 chọn khách · F9 thanh toán (P0.2)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleHotkey(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.key === 'F2') {
        e.preventDefault()
        if (!payOpen) setQuickAddOpen(true)
      } else if (e.key === 'F4') {
        e.preventDefault()
        customerInputRef.current?.focus()
      } else if (e.key === 'F9') {
        e.preventDefault()
        if (payOpen) return
        if (cart.items.length === 0) {
          toast.info('Chưa có sản phẩm trong giỏ.')
          return
        }
        setPayOpen(true)
      }
    }
    window.addEventListener('keydown', handleHotkey)
    return () => window.removeEventListener('keydown', handleHotkey)
  }, [payOpen, cart.items.length])

  // ---------------------------------------------------------------------------
  // Buffer quét mã vạch (giữ nguyên cơ chế gốc) + âm báo/toast khi quét lỗi
  // ---------------------------------------------------------------------------
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // F2/F4/F9 do handler hotkey xử lý riêng — không đưa vào buffer quét.
      if (e.key.startsWith('F') && e.key.length > 1) return

      const now = Date.now()
      if (now - lastKeyTime.current > 50) barcodeBuffer.current = ''
      lastKeyTime.current = now

      if (e.key === 'Enter') {
        if (barcodeBuffer.current.length >= 8) {
          const scannedCode = barcodeBuffer.current
          const exact = allProducts.find((p) => p.barcode === scannedCode)
          if (exact) {
            cart.add(exact)
            toast.success(`Đã thêm ${exact.name}`)
            beep('success')
          } else {
            toast.error(`Không tìm thấy sản phẩm mã ${scannedCode}`)
            beep('error')
          }
        }
        barcodeBuffer.current = ''
      } else if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        barcodeBuffer.current += e.key
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allProducts, cart.add])

  // ---------------------------------------------------------------------------
  // Tổng tiền: tạm tính − giảm giá dòng − giảm giá đơn (khớp pipeline
  // computeOrderParts trong orders repo: giảm dòng trước, giảm đơn sau)
  // ---------------------------------------------------------------------------
  const lineDiscountCents = cart.items.reduce((sum, i) => {
    const gross = i.product.price * i.qty
    return sum + Math.min(gross, dongToCents(lineDiscounts[i.product.id] ?? ''))
  }, 0)
  const orderDiscountCents = Math.min(
    Math.max(0, cart.subtotalCents - lineDiscountCents),
    parseDong(discountDong) * 100
  )
  const totalCents = Math.max(0, cart.subtotalCents - lineDiscountCents - orderDiscountCents)

  function buildOrderItems() {
    return cart.items.map((i) => ({
      product_id: i.product.id,
      quantity: i.qty,
      unit_price: i.product.price,
      tax_rate: 0,
      discount_amount: Math.min(i.product.price * i.qty, dongToCents(lineDiscounts[i.product.id] ?? ''))
    }))
  }

  function clearCartState() {
    cart.clear()
    setDiscountDong('')
    setLineDiscounts({})
    setSelectedCustomer(null)
    setEditingHeld(null)
  }

  const handleLineDiscount = useCallback((id: number, dong: string) => {
    setLineDiscounts((prev) => {
      const next = { ...prev }
      if (dong) next[id] = dong
      else delete next[id]
      return next
    })
  }, [])

  // ---------------------------------------------------------------------------
  // Đơn treo (P1.5): hold / updateHeld / restore / convert / void
  // ---------------------------------------------------------------------------
  async function holdCurrentBill() {
    if (cart.items.length === 0 || !user) return
    const items = buildOrderItems()
    try {
      if (editingHeld) {
        // Đơn treo gọi về đã mang mức giảm chốt lúc treo (GỘM khuyến mại theo
        // engine trong header/discount_amount và từng order_details.discount_-
        // amount). Nạp về ô giảm giá thủ công rồi chạy lại engine sẽ NHÂN ĐÔI
        // giảm giá — nên sửa đơn treo giữ nguyên mức giảm, không chạy lại KM.
        await api.orders.updateHeld(editingHeld.id, {
          items,
          customer_id: selectedCustomer?.id ?? null,
          discount_amount: orderDiscountCents,
          apply_promotions: false
        })
        toast.success(`Đã cập nhật đơn treo #${editingHeld.invoice_no}`)
      } else {
        const order = await api.orders.hold({
          user_id: user.id,
          customer_id: selectedCustomer?.id ?? null,
          shift_id: activeShift?.id ?? null,
          items,
          discount_amount: orderDiscountCents
        })
        toast.success(`Đã treo đơn #${order.invoice_no}`)
      }
      clearCartState()
      void refreshHeld()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không treo được đơn.')
    }
  }

  /** Gọi đơn treo về giỏ để sửa/thanh toán (bản snapshot lưu trong DB). */
  async function restoreHeld(bill: HeldBill): Promise<boolean> {
    if (cart.items.length > 0) {
      toast.error('Thanh toán hoặc treo đơn hiện tại trước khi gọi lại đơn cũ')
      return false
    }
    setHeldBusyId(bill.id)
    try {
      const order = await api.orders.getById(bill.id)
      if (!order || order.held_at == null) {
        toast.error('Đơn treo không còn tồn tại.')
        void refreshHeld()
        return false
      }
      const products = await Promise.all(
        (order.details ?? []).map((d) => api.products.getById(d.product_id).catch(() => undefined))
      )
      const items: Array<{ product: Product; qty: number }> = []
      const discounts: Record<number, string> = {}
      let droppedLines = 0
      ;(order.details ?? []).forEach((d, idx) => {
        const p = products[idx]
        if (!p || p.is_active !== 1) {
          // Sản phẩm đã bị vô hiệu hóa/ngừng bán — không thể nạp về giỏ.
          droppedLines++
          return
        }
        items.push({ product: p, qty: d.quantity })
        if (d.discount_amount > 0) discounts[p.id] = String(Math.round(d.discount_amount / 100))
      })
      if (items.length === 0) {
        toast.error('Không gọi lại được đơn (sản phẩm không còn bán).')
        return false
      }
      // Không bỏ dòng im lặng: người thu ngân cần biết đơn sẽ thiếu hàng so với
      // bản treo — thanh toán đơn này sẽ ghi đè items theo giỏ (đã thiếu dòng).
      if (droppedLines > 0) {
        toast.warning(
          `Đơn treo #${bill.invoice_no} có ${droppedLines} dòng sản phẩm không còn bán — sẽ bị bỏ khỏi đơn khi thanh toán.`
        )
      }
      cart.setItems(items)
      setLineDiscounts(discounts)
      setDiscountDong(
        order.discount_amount > 0 ? String(Math.round(order.discount_amount / 100)) : ''
      )
      if (order.customer_id) {
        const c = await api.customers.getById(order.customer_id).catch(() => undefined)
        setSelectedCustomer(c ?? null)
      } else {
        setSelectedCustomer(null)
      }
      setEditingHeld({ id: order.id, invoice_no: order.invoice_no })
      setShowHeldModal(false)
      toast.info(`Đang làm việc với đơn treo #${bill.invoice_no} — thanh toán để chốt đơn`)
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không gọi lại được đơn treo.')
      return false
    } finally {
      setHeldBusyId(null)
    }
  }

  async function payHeld(bill: HeldBill) {
    const ok = await restoreHeld(bill)
    if (ok) setPayOpen(true)
  }

  async function voidHeld(bill: HeldBill) {
    if (!user) return
    setHeldBusyId(bill.id)
    try {
      await api.orders.voidOrder(bill.id, user.id, 'Hủy đơn treo')
      toast.success(`Đã hủy đơn treo #${bill.invoice_no}`)
      if (editingHeld?.id === bill.id) clearCartState()
      void refreshHeld()
      void refreshProducts()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hủy đơn thất bại.')
    } finally {
      setHeldBusyId(null)
    }
  }

  // ---------------------------------------------------------------------------
  // Thanh toán xong: in hóa đơn 80mm (P0.3) + dọn giỏ + refresh
  // ---------------------------------------------------------------------------
  function handlePaid(order: Order, changeCents: number) {
    const customerName = selectedCustomer?.name ?? null
    setPayOpen(false)
    setLastOrder(order)
    setLastChange(changeCents)
    clearCartState()
    setResults([])
    setSearching(false)
    void refreshProducts()
    void refreshHeld()
    printReceipt(order, {
      store: storeConfig,
      cashierName: user?.display_name ?? '',
      paymentMethods,
      customerName,
      changeCents
    }).catch(() => toast.error('Không in được hóa đơn — dùng nút "In lại".'))
  }

  function reprintOrder(order: Order, changeCents: number) {
    printReceipt(order, {
      store: storeConfig,
      cashierName: user?.display_name ?? '',
      paymentMethods,
      changeCents
    }).catch(() => toast.error('Không in được hóa đơn.'))
  }

  const gridProducts = searching ? results : allProducts

  const cartItems: CartItemView[] = cart.items.map((i) => ({
    id: i.product.id,
    name: i.product.name,
    priceCents: i.product.price,
    qty: i.qty,
    maxQty: i.product.stock,
    discountDong: lineDiscounts[i.product.id] ?? ''
  }))

  const payLines: CartLineInput[] = cart.items.map((i) => ({
    product_id: i.product.id,
    quantity: i.qty,
    unit_price: i.product.price,
    discount_amount: Math.min(i.product.price * i.qty, dongToCents(lineDiscounts[i.product.id] ?? ''))
  }))

  return (
    <div className="relative flex h-full flex-col">
      <div className="border-b bg-card px-6 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold">Bán hàng</h1>
          <div className="flex items-center gap-2 text-xs">
            {activeShift ? (
              <>
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700">
                  Ca mở lúc {formatDateTime(activeShift.opened_at)}
                </span>
                <span className="hidden rounded-full bg-secondary px-3 py-1 text-muted-foreground xl:inline">
                  Tiền đầu ca{' '}
                  <span className="font-mono font-semibold text-foreground">
                    {formatVnd(activeShift.opening_cash)}
                  </span>
                </span>
              </>
            ) : (
              <span className="rounded-full bg-amber-500/10 px-3 py-1 font-medium text-amber-700">
                Chưa mở ca
              </span>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setQuickAddOpen(true)}>
              <PackagePlus className="h-3.5 w-3.5" />
              Thêm hàng
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">F2</kbd>
            </Button>
            <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setRecentOpen(true)}>
              <History className="h-3.5 w-3.5" />
              Đơn gần đây
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setConfigOpen(true)}
              aria-label="Cấu hình cửa hàng"
              title="Cấu hình cửa hàng (in hóa đơn, QR)"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col border-r">
          <div className="border-b bg-card p-3">
            <ProductSearch
              onResults={(items, s) => {
                setResults(items)
                setSearching(s)
              }}
              onAddToCart={cart.add}
            />
            <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              <ScanBarcode className="h-3 w-3" />
              Quét mã vạch để thêm hàng ·
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">F2</kbd> Thêm hàng
              nhanh ·
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">F4</kbd> Chọn khách ·
              <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">F9</kbd> Thanh toán
            </p>
          </div>
          {loadingProducts ? (
            <div
              className="grid flex-1 gap-3 overflow-hidden p-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', alignContent: 'start' }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-lg" />
              ))}
            </div>
          ) : (
            <ProductGrid products={gridProducts} onAdd={cart.add} />
          )}
        </div>

        <div className="flex w-[380px] shrink-0 flex-col bg-background">
          <div className="border-b p-3">
            <CustomerPicker
              customer={selectedCustomer}
              onSelect={setSelectedCustomer}
              inputRef={customerInputRef}
            />
          </div>

          <HeldBillsBar
            count={heldBills.length}
            canHold={cart.items.length > 0}
            onHold={() => void holdCurrentBill()}
            onShowList={() => setShowHeldModal(true)}
          />

          <div className="flex-1 overflow-hidden">
            <Cart
              items={cartItems}
              discountDong={discountDong}
              subtotalCents={cart.subtotalCents}
              lineDiscountCents={lineDiscountCents}
              discountCents={orderDiscountCents}
              totalCents={totalCents}
              onInc={cart.inc}
              onDec={cart.dec}
              onRemove={cart.remove}
              onDiscountChange={setDiscountDong}
              onLineDiscountChange={handleLineDiscount}
              onClear={() => {
                const wasEditing = editingHeld != null
                clearCartState()
                if (wasEditing) {
                  toast.info('Đã bỏ giỏ — đơn treo vẫn giữ nguyên trong danh sách.')
                  void refreshHeld()
                }
              }}
              onPay={() => setPayOpen(true)}
            />
          </div>
        </div>
      </div>

      <HeldBillsDialog
        open={showHeldModal}
        bills={heldBills}
        busyBillId={heldBusyId}
        onClose={() => setShowHeldModal(false)}
        onPay={(bill) => void payHeld(bill)}
        onRestore={(bill) => void restoreHeld(bill)}
        onVoid={(bill) => void voidHeld(bill)}
      />

      <PaymentDialog
        open={payOpen}
        paymentMethods={paymentMethods}
        storeConfig={storeConfig}
        totalCents={totalCents}
        lines={payLines}
        discountCents={orderDiscountCents}
        userId={user?.id ?? 0}
        shiftId={activeShift?.id ?? null}
        customer={selectedCustomer}
        heldOrder={editingHeld}
        onRequestConfigure={() => setConfigOpen(true)}
        onClose={() => setPayOpen(false)}
        onPaid={handlePaid}
      />

      <QuickAddDialog
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onCreated={(product, addToCart) => {
          void refreshProducts()
          if (addToCart && product.stock > 0) {
            cart.add(product)
            toast.info(`Đã thêm "${product.name}" vào giỏ.`)
          }
        }}
      />

      <RecentOrdersDialog
        open={recentOpen}
        userId={user?.id ?? 0}
        paymentMethods={paymentMethods}
        onClose={() => setRecentOpen(false)}
        onOrdersChanged={() => {
          void refreshProducts()
          void refreshHeld()
        }}
      />

      <StoreConfigDialog
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        onSaved={(cfg) => setStoreConfig(cfg)}
      />

      <Dialog open={lastOrder !== null} onOpenChange={(o) => !o && setLastOrder(null)}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          {lastOrder && (
            <div className="text-center">
              <div className="flex flex-col items-center gap-2 px-6 pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                  <CircleCheckBig className="h-6 w-6 text-emerald-600" />
                </div>
                <h2 className="text-lg font-bold">Thanh toán thành công</h2>
                <p className="text-sm text-muted-foreground">Hóa đơn #{lastOrder.invoice_no}</p>
              </div>
              <div className="mx-6 mt-4 space-y-1.5 rounded-lg bg-secondary p-4 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Tổng tiền</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {formatVnd(lastOrder.total)}
                  </span>
                </div>
                {lastChange > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Tiền thối lại</span>
                    <span className="font-mono font-bold tabular-nums">{formatVnd(lastChange)}</span>
                  </div>
                )}
              </div>
              <div aria-hidden className="receipt-tear mx-6" />
              <div className="flex gap-2 bg-secondary px-6 pb-6 pt-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => reprintOrder(lastOrder, lastChange)}
                >
                  <Printer className="mr-1 h-4 w-4" />
                  In lại
                </Button>
                <Button className="flex-1" onClick={() => setLastOrder(null)}>
                  Đơn mới
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
