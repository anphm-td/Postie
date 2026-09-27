// ============================================================================
//  Postie POS - Màn BÁO CÁO (routes/Reports.tsx)
// ----------------------------------------------------------------------------
//  Tabs: Tổng quan (thẻ số liệu + biểu đồ theo ngày + phương thức CK +
//  top bán chạy) · Theo ngày · Theo ca · Nhân viên · Sản phẩm · Nhóm hàng ·
//  Tồn kho (+tồn thấp) · Lịch sử ca (thu/chi tiền trong ca, đối ca).
//  Chọn khoảng thời gian: preset hoặc tùy chọn — áp cho mọi tab doanh thu;
//  nút làm mới. Tồn kho & Lịch sử ca không theo khoảng (dữ liệu hiện tại).
//  Toàn bộ dữ liệu qua api.reports:* / api.shifts:* (preload API).
// ============================================================================

import { useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  Clock,
  History,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  Users
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { SegmentedTabs } from '@renderer/components/reports/SegmentedTabs'
import type { TabDef } from '@renderer/components/reports/SegmentedTabs'
import {
  DateRangePicker,
  describeRange,
  presetRange
} from '@renderer/components/reports/DateRangePicker'
import type { DateRange } from '@renderer/components/reports/DateRangePicker'
import { OverviewPanel } from '@renderer/components/reports/OverviewPanel'
import {
  DailyPanel,
  ShiftPanel,
  UserPanel,
  ProductPanel,
  CategoryPanel
} from '@renderer/components/reports/RevenuePanels'
import { StockPanel } from '@renderer/components/reports/StockPanel'
import { ShiftHistoryPanel } from '@renderer/components/shifts/ShiftHistoryPanel'

const TABS: TabDef[] = [
  { id: 'overview', label: 'Tổng quan', icon: BarChart3 },
  { id: 'daily', label: 'Theo ngày', icon: CalendarDays },
  { id: 'shift', label: 'Theo ca', icon: Clock },
  { id: 'user', label: 'Nhân viên', icon: Users },
  { id: 'product', label: 'Sản phẩm', icon: ShoppingCart },
  { id: 'category', label: 'Nhóm hàng', icon: TrendingUp },
  { id: 'stock', label: 'Tồn kho', icon: Package },
  { id: 'history', label: 'Lịch sử ca', icon: History }
]

export function Reports() {
  const [range, setRange] = useState<DateRange>(() => presetRange('today'))
  const [tab, setTab] = useState('overview')
  const [refreshKey, setRefreshKey] = useState(0)

  const needsRange = tab !== 'stock' && tab !== 'history'

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Báo cáo</h1>
            <p className="text-sm text-muted-foreground">{describeRange(range)}</p>
          </div>
          <div className="flex items-center gap-2">
            {needsRange && <DateRangePicker value={range} onChange={setRange} />}
            <Button
              variant="outline"
              size="icon"
              onClick={() => setRefreshKey((k) => k + 1)}
              title="Làm mới số liệu"
              aria-label="Làm mới số liệu"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === 'overview' && <OverviewPanel range={range} refreshKey={refreshKey} />}
        {tab === 'daily' && <DailyPanel range={range} refreshKey={refreshKey} />}
        {tab === 'shift' && <ShiftPanel range={range} refreshKey={refreshKey} />}
        {tab === 'user' && <UserPanel range={range} refreshKey={refreshKey} />}
        {tab === 'product' && <ProductPanel range={range} refreshKey={refreshKey} />}
        {tab === 'category' && <CategoryPanel range={range} refreshKey={refreshKey} />}
        {tab === 'stock' && <StockPanel refreshKey={refreshKey} />}
        {tab === 'history' && <ShiftHistoryPanel key={refreshKey} />}
      </div>
    </div>
  )
}
