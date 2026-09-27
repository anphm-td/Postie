// ============================================================================
//  Postie POS - StockPanel: tab "Tồn kho" của màn Báo cáo (P1.9)
// ----------------------------------------------------------------------------
//  Nạp api.reports.stockReport({}) — tồn hiện tại (cột dẫn xuất, CHỈ ĐỌC),
//  giá trị kho = Σ stock×cost, hàng hết/tồn thấp theo low_stock_alert.
//  Báo cáo không theo khoảng thời gian — chỉ phụ thuộc refreshKey.
// ============================================================================

import { api } from '@renderer/lib/api'
import { useAsync } from './useAsync'
import { StockReportTable } from './StockReportTable'
import type { AsyncState } from './useAsync'
import type { StockReportResult } from './reportTypes'

export function StockPanel({ refreshKey }: { refreshKey: number }) {
  const state: AsyncState<StockReportResult> = useAsync(() => api.reports.stockReport({}), [
    refreshKey
  ])

  if (state.error && !state.loading) {
    return <p className="py-10 text-center text-sm text-destructive">{state.error}</p>
  }

  return <StockReportTable result={state.data} loading={state.loading} />
}
