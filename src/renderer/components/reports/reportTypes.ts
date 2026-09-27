// ============================================================================
//  Postie POS - Báo cáo: các kiểu dữ liệu dẫn xuất từ window.postieAPI
// ----------------------------------------------------------------------------
//  Không định nghĩa lại shape của row báo cáo — mọi kiểu đều DẪN XUẤT từ
//  interface PostieAPI (electron/preload.ts) nên không bao giờ lệch với
//  nguồn chân lý ở electron/db/repositories/reports.ts.
//  Chỉ import TYPE (bị erase khi build) — renderer không nạp code Electron.
// ============================================================================

import type { PostieAPI } from '@preload'
import type { ShiftCashEvent, ShiftStatus } from '@shared/types'
import { formatVnd } from '@renderer/lib/format'

/** Nhóm reports của preload API. */
export type ReportsApi = PostieAPI['reports']
export type ShiftsApi = PostieAPI['shifts']

/**
 * Khoảng thời gian + bộ lọc dùng chung: from/to là unix seconds (bao gồm cả 2
 * đầu), shiftId/userId là filter tùy chọn — khớp ReportRange phía repo.
 * Tham số đầu của getSalesSummary là OPTIONAL (range?: ReportRange) nên
 * Parameters<...>[0] gồm undefined — bọc NonNullable vì toReportRange LUÔN
 * trả về object, nếu không mọi caller đều dính TS18048 "'r' is possibly
 * 'undefined'".
 */
export type ReportRangeArg = NonNullable<Parameters<ReportsApi['getSalesSummary']>[0]>

/** Tổng hợp doanh thu / đã thu / giá vốn / lợi nhuận gộp cho 1 khoảng. */
export type SalesSummary = Awaited<ReturnType<ReportsApi['getSalesSummary']>>

export type DailyRevenueRow = Awaited<ReturnType<ReportsApi['revenueByDay']>>[number]
export type ShiftRevenueRow = Awaited<ReturnType<ReportsApi['revenueByShift']>>[number]
export type UserRevenueRow = Awaited<ReturnType<ReportsApi['revenueByUser']>>[number]
export type ProductRevenueRow = Awaited<ReturnType<ReportsApi['revenueByProduct']>>[number]
export type CategoryRevenueRow = Awaited<ReturnType<ReportsApi['revenueByCategory']>>[number]
export type PaymentMethodRevenueRow =
  Awaited<ReturnType<ReportsApi['revenueByPaymentMethod']>>[number]

export type StockReportResult = Awaited<ReturnType<ReportsApi['stockReport']>>
export type StockRow = StockReportResult['items'][number]
export type StockReportSummary = StockReportResult['summary']

/** Ca kèm tên thu ngân (JOIN users) cho Lịch sử ca. */
export type ShiftWithUser = Awaited<ReturnType<ShiftsApi['list']>>[number]
export type ShiftListOptionsArg = Parameters<ShiftsApi['list']>[0]
export type ShiftCashEventRow = ShiftCashEvent
export type ShiftCashEventTypeValue = ShiftCashEvent['type']
export type { ShiftStatus }

// ----------------------------------------------------------------------------
// Helpers hiển thị dùng chung
// ----------------------------------------------------------------------------

/**
 * Đổi DateRange (null = không chặn) thành ReportRangeArg của preload API
 * (undefined = không lọc chiều tương ứng).
 */
export function toReportRange(range: { from: number | null; to: number | null }): ReportRangeArg {
  return {
    from: range.from ?? undefined,
    to: range.to ?? undefined
  }
}

/** formatVnd kèm dấu "+" cho số dương — dùng cho cột chênh lệch. */
export function signedVnd(cents: number): string {
  if (cents > 0) return `+${formatVnd(cents)}`
  return formatVnd(cents)
}
