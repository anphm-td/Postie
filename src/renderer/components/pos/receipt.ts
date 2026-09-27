// ============================================================================
//  In hóa đơn 80mm (P0.3 — docs/kiotviet-roadmap.md §5, mục "In hóa đơn sau
//  thanh toán"). Template HTML + window.print() của Chromium qua iframe ẩn:
//  Electron in đúng nội dung iframe với @page 80mm mà không mở cửa sổ mới.
//  Với máy in nhiệt 80mm đã cài driver hệ thống thì in khổ K80 được ngay,
//  không cần ESC/POS (node-thermal-printer để dành khi cần in trực tiếp USB).
// ============================================================================

import type { Order, OrderDetailRow, OrderPaymentRow, PaymentMethod } from '@shared/types'
import { api } from '@renderer/lib/api'
import { formatDateTime } from '@renderer/lib/format'
import type { StoreConfig } from './storeConfig'

export interface ReceiptOptions {
  store: StoreConfig
  cashierName: string
  paymentMethods: PaymentMethod[]
  customerName?: string | null
  /** Tiền thối lại cho khách (cents) — chỉ in khi > 0. */
  changeCents?: number
  /** Tên sản phẩm theo product_id — tự điền nếu bỏ qua. */
  productNames?: Record<number, string>
}

function esc(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function vnd(cents: number): string {
  return `${(cents / 100).toLocaleString('vi-VN')}₫`
}

const SEP = '<div style="border-top:1px dashed #000;margin:6px 0"></div>'

async function fetchProductNames(order: Order): Promise<Record<number, string>> {
  const details = order.details ?? []
  const ids = [...new Set(details.map((d) => d.product_id))]
  if (ids.length === 0) return {}
  const entries = await Promise.all(
    ids.map(async (id) => {
      try {
        const p = await api.products.getById(id)
        return [id, p?.name ?? `SP #${id}`] as const
      } catch {
        return [id, `SP #${id}`] as const
      }
    })
  )
  return Object.fromEntries(entries)
}

export function buildReceiptHtml(order: Order, opts: ReceiptOptions): string {
  const { store, cashierName, paymentMethods, customerName, changeCents = 0 } = opts
  const names = opts.productNames ?? {}
  const details: OrderDetailRow[] = order.details ?? []
  const payments: OrderPaymentRow[] = order.payments ?? []
  const methodName = (id: number): string =>
    paymentMethods.find((m) => m.id === id)?.name ?? `Phương thức #${id}`

  const gross = details.reduce((s, d) => s + d.unit_price * d.quantity, 0)
  const lineDiscount = details.reduce((s, d) => s + d.discount_amount, 0)

  const lineHtml = details
    .map((d) => {
      const net = Math.max(0, d.unit_price * d.quantity - d.discount_amount)
      const name = names[d.product_id] ?? `SP #${d.product_id}`
      return [
        '<div style="margin-bottom:3px">',
        `<div>${esc(name)}</div>`,
        `<div class="row"><span class="muted">${d.quantity} × ${vnd(d.unit_price)}</span><span>${vnd(net)}</span></div>`,
        d.discount_amount > 0
          ? `<div class="row muted" style="font-style:italic"><span>Giảm dòng</span><span>-${vnd(d.discount_amount)}</span></div>`
          : '',
        '</div>'
      ]
        .filter(Boolean)
        .join('')
    })
    .join('')

  const paymentHtml = payments
    .map((p) => {
      const ref = p.reference ? ` <span class="muted">(${esc(p.reference)})</span>` : ''
      return `<div class="row"><span>${esc(methodName(p.payment_method_id))}${ref}</span><span>${vnd(p.amount)}</span></div>`
    })
    .join('')

  const owed = Math.max(0, order.total - order.paid_amount)

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Hóa đơn #${order.invoice_no}</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  html, body { margin: 0; padding: 0; }
  body { width: 76mm; font-family: 'Courier New', 'Be Vietnam Pro', monospace; font-size: 11px; line-height: 1.45; color: #000; }
  .center { text-align: center; }
  .store-name { font-size: 15px; font-weight: 700; letter-spacing: .5px; }
  .muted { color: #333; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .total { font-size: 14px; font-weight: 700; }
</style>
</head>
<body>
<div class="center">
  <div class="store-name">${esc(store.store_name || 'Postie POS')}</div>
  ${store.store_address ? `<div class="muted">${esc(store.store_address)}</div>` : ''}
  ${store.store_phone ? `<div class="muted">ĐT: ${esc(store.store_phone)}</div>` : ''}
</div>
${SEP}
<div class="center" style="font-weight:700">HÓA ĐƠN BÁN HÀNG</div>
<div class="row"><span>Số HĐ</span><b>#${order.invoice_no}</b></div>
<div class="row"><span>Thời gian</span><span>${formatDateTime(order.created_at)}</span></div>
<div class="row"><span>Thu ngân</span><span>${esc(cashierName || '—')}</span></div>
${customerName ? `<div class="row"><span>Khách hàng</span><span>${esc(customerName)}</span></div>` : ''}
${SEP}
${lineHtml}
${SEP}
<div class="row"><span>Tạm tính</span><span>${vnd(gross)}</span></div>
${lineDiscount > 0 ? `<div class="row"><span>Giảm giá dòng</span><span>-${vnd(lineDiscount)}</span></div>` : ''}
${order.discount_amount > 0 ? `<div class="row"><span>Giảm giá đơn${order.discount_reason ? ` (${esc(order.discount_reason)})` : ''}</span><span>-${vnd(order.discount_amount)}</span></div>` : ''}
<div class="row total"><span>TỔNG CỘNG</span><span>${vnd(order.total)}</span></div>
${payments.length > 0 ? SEP + paymentHtml : ''}
${owed > 0 ? `<div class="row" style="font-weight:700"><span>Còn nợ</span><span>${vnd(owed)}</span></div>` : ''}
${changeCents > 0 ? `<div class="row total"><span>TIỀN THỐI LẠI</span><span>${vnd(changeCents)}</span></div>` : ''}
${SEP}
<div class="center muted">${esc(store.receipt_footer)}</div>
<div style="height:6mm"></div>
</body>
</html>`
}

function printReceiptHtml(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const win = iframe.contentWindow
  const doc = win?.document
  if (!win || !doc) {
    iframe.remove()
    throw new Error('Không tạo được khung in hóa đơn.')
  }
  doc.open()
  doc.write(html)
  doc.close()
  window.setTimeout(() => {
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(() => iframe.remove(), 2000)
    }
  }, 150)
}

/** Lấy tên sản phẩm cho từng dòng rồi dựng HTML và gọi hộp thoại in. */
export async function printReceipt(order: Order, opts: ReceiptOptions): Promise<void> {
  const productNames =
    opts.productNames ?? (order.details && order.details.length > 0 ? await fetchProductNames(order) : {})
  printReceiptHtml(buildReceiptHtml(order, { ...opts, productNames }))
}
