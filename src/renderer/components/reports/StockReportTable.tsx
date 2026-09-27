// ============================================================================
//  Postie POS - Bảng tồn kho (api.reports.stockReport)
// ----------------------------------------------------------------------------
//  Tồn kho là CỘT DẪN XUẤT (trigger sync từ stock_movements) — bảng chỉ ĐỌC,
//  không có hành động sửa số. Badge tồn: đỏ = hết hàng (stock <= 0), vàng =
//  tồn thấp (0 < stock <= low_stock_alert) — cùng quy ước với Products.tsx.
// ============================================================================

import { useState } from 'react'
import { Search } from 'lucide-react'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import { formatVnd } from '@renderer/lib/format'
import { EmptyState } from './EmptyState'
import { StatCard } from './SummaryCards'
import type { StockReportResult, StockRow } from './reportTypes'

function StockBadge({ row }: { row: StockRow }) {
  if (row.stock <= 0) {
    return <Badge variant="destructive">Hết hàng</Badge>
  }
  if (row.low_stock_alert > 0 && row.stock <= row.low_stock_alert) {
    return <Badge className="bg-amber-500/15 text-amber-700">Tồn thấp</Badge>
  }
  return <Badge variant="secondary">{row.stock}</Badge>
}

export function StockReportTable({
  result,
  loading
}: {
  result: StockReportResult | null
  loading: boolean
}) {
  const [search, setSearch] = useState('')
  const [lowOnly, setLowOnly] = useState(false)

  if (loading || !result) {
    return (
      <div className="space-y-2 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-secondary" />
        ))}
      </div>
    )
  }

  const needle = search.trim().toLowerCase()
  const items = result.items.filter((it) => {
    if (lowOnly && !(it.stock <= 0 || (it.low_stock_alert > 0 && it.stock <= it.low_stock_alert))) {
      return false
    }
    if (!needle) return true
    return (
      it.name.toLowerCase().includes(needle) ||
      (it.barcode ?? '').toLowerCase().includes(needle) ||
      (it.category_name ?? '').toLowerCase().includes(needle)
    )
  })

  const { summary } = result

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Số sản phẩm" value={summary.product_count.toLocaleString('vi-VN')} />
        <StatCard
          label="Giá trị kho (theo giá vốn)"
          value={formatVnd(summary.total_stock_value)}
          mono
        />
        <StatCard
          label="Hết hàng"
          value={String(summary.out_of_stock_count)}
          tone={summary.out_of_stock_count > 0 ? 'negative' : 'default'}
        />
        <StatCard
          label="Tồn thấp"
          value={String(summary.low_stock_count)}
          tone={summary.low_stock_count > 0 ? 'warning' : 'default'}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, mã vạch, nhóm hàng…"
            className="pl-9"
          />
        </div>
        <button
          onClick={() => setLowOnly((v) => !v)}
          className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            lowOnly
              ? 'border-amber-500 bg-amber-500/15 text-amber-700'
              : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          Chỉ hàng hết / tồn thấp
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Không có sản phẩm nào khớp bộ lọc" />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sản phẩm</TableHead>
                <TableHead>Nhóm</TableHead>
                <TableHead className="text-right">Tồn</TableHead>
                <TableHead>Đơn vị</TableHead>
                <TableHead className="text-right">Giá bán</TableHead>
                <TableHead className="text-right">Giá vốn</TableHead>
                <TableHead className="text-right">Giá trị kho</TableHead>
                <TableHead className="text-right">Bán 30 ngày</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.product_id}>
                  <TableCell className="max-w-64">
                    <div className="font-medium">{it.name}</div>
                    {it.barcode && (
                      <div className="font-mono text-xs text-muted-foreground">{it.barcode}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {it.category_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <StockBadge row={it} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{it.unit ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatVnd(it.price)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {formatVnd(it.cost)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatVnd(it.stock_value)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {it.sold_qty_30d}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
