import { useCallback, useEffect, useState } from 'react'
import { Plus, Truck } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatDateTime, formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import { PurchaseFormDialog } from '@renderer/components/inventory/PurchaseFormDialog'
import { PurchaseDetailDialog } from '@renderer/components/inventory/PurchaseDetailDialog'
import { PO_STATUS_META } from '@renderer/components/inventory/labels'
import type { PurchaseOrder, PurchaseOrderStatus, Supplier } from '@shared/types'

/**
 * NHẬP HÀNG (P1.2): danh sách phiếu nhập theo NCC/trạng thái + tạo phiếu
 * (purchases:create) + nhận hàng/hủy/trả tiền trong detail dialog. Còn nợ =
 * total − paid (sổ cái supplier_ledger là nguồn sự thật, cột này chỉ để hiển thị).
 */
export function Purchases() {
  const { user } = useAuth()
  const userId = user?.id ?? 0

  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState<'' | PurchaseOrderStatus>('')
  const [supplierFilter, setSupplierFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [detailTarget, setDetailTarget] = useState<PurchaseOrder | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setOrders(
        await api.purchases.list({
          status: statusFilter === '' ? undefined : statusFilter,
          supplier_id: supplierFilter ? Number(supplierFilter) : undefined,
          limit: 200
        })
      )
    } finally {
      setLoading(false)
    }
  }, [statusFilter, supplierFilter])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void api.suppliers.list({ pageSize: 200 }).then((res) => setSuppliers(res.items))
  }, [])

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-4">
        <div className="flex items-center gap-2">
          <Truck className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Nhập hàng</h1>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Tạo phiếu nhập
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-6 pb-3">
        {(
          [
            ['', 'Tất cả'],
            [0, 'Chờ giao'],
            [1, 'Đã nhập'],
            [2, 'Đã hủy']
          ] as Array<['' | PurchaseOrderStatus, string]>
        ).map(([value, label]) => (
          <Button
            key={String(value)}
            size="sm"
            variant={statusFilter === value ? 'default' : 'outline'}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </Button>
        ))}
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="ml-auto flex h-9 w-64 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Lọc theo nhà cung cấp"
        >
          <option value="">Tất cả nhà cung cấp</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <Truck className="h-10 w-10 text-muted-foreground" />
              <p className="font-medium">Chưa có phiếu nhập nào</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Tạo phiếu nhập để ghi nhận hàng đặt NCC. Tồn kho và công nợ chỉ được ghi sổ khi
                nhận hàng.
              </p>
              <Button className="mt-1" onClick={() => setShowForm(true)}>
                <Plus className="mr-1 h-4 w-4" />
                Tạo phiếu nhập
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Phiếu</TableHead>
                  <TableHead>Nhà cung cấp</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Tổng tiền</TableHead>
                  <TableHead className="text-right">Đã trả</TableHead>
                  <TableHead className="text-right">Còn nợ</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((po) => {
                  const meta = PO_STATUS_META[po.status]
                  const debt = Math.max(0, po.total - po.paid)
                  return (
                    <TableRow key={po.id} className={po.status === 2 ? 'opacity-60' : undefined}>
                      <TableCell className="font-mono font-medium">#{po.id}</TableCell>
                      <TableCell className="font-medium">{po.supplier_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={meta.badge}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVnd(po.total)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        {formatVnd(po.paid)}
                      </TableCell>
                      <TableCell className="text-right">
                        {debt > 0 ? (
                          <span className="font-mono font-semibold tabular-nums text-destructive">
                            {formatVnd(debt)}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(po.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={po.status === 0 ? 'default' : 'outline'} onClick={() => setDetailTarget(po)}>
                          {po.status === 0 ? 'Nhận hàng' : 'Xem'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <PurchaseFormDialog
        open={showForm}
        userId={userId}
        onClose={() => setShowForm(false)}
        onCreated={() => void load()}
      />
      <PurchaseDetailDialog
        po={detailTarget}
        userId={userId}
        onClose={() => setDetailTarget(null)}
        onUpdated={() => void load()}
      />
    </div>
  )
}
