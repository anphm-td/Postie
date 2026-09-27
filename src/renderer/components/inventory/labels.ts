// ============================================================================
//  Postie POS - Nhãn/meta dùng chung cho mảng Kho & hàng hóa (P0.7 / P1)
// ----------------------------------------------------------------------------
//  Các nhãn tiếng Việt + class badge cho trạng thái phiếu (nhập hàng, kiểm
//  kho), loại biến động tồn (thẻ kho) và loại dòng sổ cái NCC. Chỉ là hàm/
//  hằng hiển thị — không gọi IPC.
// ============================================================================

import { formatVnd } from '@renderer/lib/format'
import type {
  PurchaseOrderStatus,
  StockMovementType,
  StocktakeStatus,
  SupplierLedgerType
} from '@shared/types'

/** Nhãn loại biến động tồn kho (stock_movements.type — types.ts). */
export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  0: 'Bán hàng',
  1: 'Trả hàng',
  2: 'Nhập hàng',
  3: 'Điều chỉnh',
  4: 'Hao hụt'
}

/** Trạng thái phiếu nhập hàng (purchase_orders.status: 0 chờ, 1 đã nhập, 2 đã hủy). */
export const PO_STATUS_META: Record<PurchaseOrderStatus, { label: string; badge: string }> = {
  0: { label: 'Chờ giao', badge: 'bg-amber-500 text-white hover:bg-amber-500' },
  1: { label: 'Đã nhập', badge: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  2: { label: 'Đã hủy', badge: 'bg-muted text-muted-foreground hover:bg-muted' }
}

/** Trạng thái phiếu kiểm kho (stocktakes.status: 0 đang kiểm, 1 hoàn thành, 2 đã hủy). */
export const STOCKTAKE_STATUS_META: Record<StocktakeStatus, { label: string; badge: string }> = {
  0: { label: 'Đang kiểm', badge: 'bg-amber-500 text-white hover:bg-amber-500' },
  1: { label: 'Hoàn thành', badge: 'bg-emerald-600 text-white hover:bg-emerald-600' },
  2: { label: 'Đã hủy', badge: 'bg-muted text-muted-foreground hover:bg-muted' }
}

/** Loại dòng sổ cái công nợ NCC (supplier_ledger.type). */
export const SUPPLIER_LEDGER_TYPE_LABELS: Record<SupplierLedgerType, string> = {
  0: 'Nợ nhập hàng',
  1: 'Trả tiền NCC',
  2: 'Điều chỉnh'
}

/** Tiền có dấu: +1.500 ₫ / −1.500 ₫ (dùng cho delta sổ cái, chênh lệch). */
export function formatSignedVnd(cents: number): string {
  if (cents === 0) return formatVnd(0)
  return `${cents > 0 ? '+' : '−'}${formatVnd(Math.abs(cents))}`
}
