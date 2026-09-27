import { useCallback, useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatDateTime } from '@renderer/lib/format'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'
import { MOVEMENT_TYPE_LABELS } from '@renderer/components/inventory/labels'
import type { Product, StockMovement } from '@shared/types'

interface StockMovementsDialogProps {
  product: Product | null
  onClose: () => void
}

/**
 * THẺ KHO (P1.1 — products:listMovements): toàn bộ lịch sử thay đổi tồn của
 * một sản phẩm, mới nhất trước (idx_stock_movements_prod_time). Chỉ đọc —
 * mọi biến động đều đến từ stock_movements (trigger tự sync products.stock).
 */
export function StockMovementsDialog({ product, onClose }: StockMovementsDialogProps) {
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const open = product !== null

  const load = useCallback(async (productId: number) => {
    setLoading(true)
    try {
      setMovements(await api.products.listMovements(productId, 200))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (product) void load(product.id)
  }, [product, load])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Thẻ kho — {product?.name}
          </DialogTitle>
          <DialogDescription>
            Lịch sử nhập / bán / điều chỉnh / hao hụt. Tồn hiện tại:{' '}
            <span className="font-mono font-semibold">{product?.stock}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Chưa có biến động tồn kho nào cho sản phẩm này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Thời điểm</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">SL thay đổi</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead>Hóa đơn</TableHead>
                  <TableHead>Nhân viên</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(m.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{MOVEMENT_TYPE_LABELS[m.type] ?? `Loại ${m.type}`}</Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono font-semibold tabular-nums',
                        m.delta > 0 ? 'text-emerald-700' : m.delta < 0 ? 'text-destructive' : ''
                      )}
                    >
                      {m.delta > 0 ? `+${m.delta}` : m.delta}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground" title={m.note ?? undefined}>
                      {m.note || '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {m.invoice_no != null ? `#${m.invoice_no}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.user_name || `#${m.created_by}`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
