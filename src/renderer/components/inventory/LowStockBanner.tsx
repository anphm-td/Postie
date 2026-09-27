import { AlertTriangle, PackageX, Eye } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import type { api } from '@renderer/lib/api'

/** Báo cáo tồn kho tổng hợp từ products:getStockReport (P1.9). */
export type StockReportSummary = Awaited<ReturnType<typeof api.products.getStockReport>>

export type StockFilterMode = 'all' | 'low' | 'out'

interface LowStockBannerProps {
  report: StockReportSummary
  filterMode: StockFilterMode
  onFilterChange: (mode: StockFilterMode) => void
}

/**
 * Cảnh báo tồn thấp NỔI BẬT (roadmap P1.9 — "cảnh báo ngưỡng là đủ"):
 * băng cảnh báo đỏ/vàng trên đầu danh sách hàng hóa, bấm để lọc nhanh
 * danh sách hết hàng / sắp hết. Ẩn khi không còn gì cảnh báo.
 */
export function LowStockBanner({ report, filterMode, onFilterChange }: LowStockBannerProps) {
  const { out_of_stock_count: out, low_stock_count: low } = report
  if (out === 0 && low === 0) return null

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
        out > 0 ? 'border-destructive/30 bg-destructive/10' : 'border-amber-500/40 bg-amber-500/10'
      )}
      role="alert"
    >
      {out > 0 ? (
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      ) : (
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          Cảnh báo tồn kho: {out > 0 && <span className="text-destructive">{out} sản phẩm hết hàng</span>}
          {out > 0 && low > 0 ? ' · ' : ''}
          {low > 0 && <span className="text-amber-700">{low} sản phẩm sắp hết (dưới định mức)</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          Nhập thêm hàng hoặc tạo phiếu nhập cho NCC để kịp thời bổ sung.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant={filterMode === 'out' ? 'default' : 'outline'}
          onClick={() => onFilterChange(filterMode === 'out' ? 'all' : 'out')}
        >
          <PackageX className="mr-1 h-4 w-4" />
          Hết hàng ({out})
        </Button>
        <Button
          size="sm"
          variant={filterMode === 'low' ? 'default' : 'outline'}
          onClick={() => onFilterChange(filterMode === 'low' ? 'all' : 'low')}
        >
          <Eye className="mr-1 h-4 w-4" />
          Sắp hết ({low})
        </Button>
      </div>
    </div>
  )
}
