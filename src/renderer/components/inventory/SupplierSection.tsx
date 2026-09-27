import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Banknote, BookOpen, Pencil, Plus, Scale, Search, Trash2, Truck } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { cn } from '@renderer/lib/utils'
import { SupplierFormDialog } from '@renderer/components/inventory/SupplierFormDialog'
import { SupplierPaymentDialog } from '@renderer/components/inventory/SupplierPaymentDialog'
import { SupplierAdjustDialog } from '@renderer/components/inventory/SupplierAdjustDialog'
import { SupplierLedgerDialog } from '@renderer/components/inventory/SupplierLedgerDialog'
import type { Supplier, SupplierSummary } from '@shared/types'

/**
 * Tab NHÀ CUNG CẤP & CÔNG NỢ PHẢI TRẢ (P1.2): CRUD + trả tiền (recordPayment
 * → supplier_ledger type=1) + điều chỉnh công nợ (adjustBalance type=2) +
 * sổ cái (getLedger). balance là cột DẪN XUẤT — mọi thay đổi qua ledger.
 */
export function SupplierSection({ userId }: { userId: number }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [summary, setSummary] = useState<SupplierSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(false)

  const [formTarget, setFormTarget] = useState<Supplier | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [payTarget, setPayTarget] = useState<Supplier | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<Supplier | null>(null)
  const [ledgerTarget, setLedgerTarget] = useState<Supplier | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const load = useCallback(async (search: string, owing: boolean) => {
    setLoading(true)
    try {
      const [res, sum] = await Promise.all([
        api.suppliers.list({
          search: search || undefined,
          onlyOwing: owing || undefined,
          pageSize: 200
        }),
        api.suppliers.getSummary()
      ])
      setSuppliers(res.items)
      setSummary(sum)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(query.trim(), onlyOwing)
  }, [query, onlyOwing, load])

  async function handleDeactivate() {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    try {
      await api.suppliers.deactivate(target.id)
      toast.success(`Đã vô hiệu hóa nhà cung cấp "${target.name}".`)
      await load(query.trim(), onlyOwing)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không vô hiệu hóa được nhà cung cấp.')
    }
  }

  function openNew() {
    setFormTarget(null)
    setShowForm(true)
  }

  const cards = [
    { label: 'NCC đang hoạt động', value: summary ? String(summary.active_suppliers) : '—' },
    {
      label: 'Đang nợ (NCC)',
      value: summary ? String(summary.debtor_count) : '—',
      accent: summary && summary.debtor_count > 0 ? 'text-amber-700' : undefined
    },
    {
      label: 'Tổng phải trả',
      value: summary ? formatVnd(summary.total_payable) : '—',
      accent: summary && summary.total_payable > 0 ? 'text-destructive' : undefined
    }
  ]

  return (
    <div className="space-y-4">
      {/* Thẻ tổng hợp công nợ */}
      <div className="grid gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={cn('mt-1 font-mono text-xl font-bold tabular-nums', c.accent)}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm NCC theo tên hoặc số điện thoại…"
            className="pl-9"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyOwing}
            onChange={(e) => setOnlyOwing(e.target.checked)}
            className="h-4 w-4 rounded border-input accent-[var(--primary,#16a34a)]"
          />
          Chỉ còn nợ
        </label>
        <div className="ml-auto">
          <Button onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            Thêm nhà cung cấp
          </Button>
        </div>
      </div>

      {/* Bảng NCC */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : suppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Truck className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Chưa có nhà cung cấp nào</p>
            <p className="text-sm text-muted-foreground">
              Thêm NCC để bắt đầu tạo phiếu nhập hàng và theo dõi công nợ.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nhà cung cấp</TableHead>
                <TableHead>Điện thoại</TableHead>
                <TableHead className="text-right">Công nợ</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => {
                const balance = s.balance ?? 0
                return (
                  <TableRow key={s.id} className={s.is_active === 0 ? 'opacity-60' : undefined}>
                    <TableCell>
                      <span className="font-medium">{s.name}</span>
                      {s.is_active === 0 && (
                        <Badge variant="secondary" className="ml-2">
                          Đã ẩn
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.phone || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {balance > 0 ? (
                        <Badge variant="destructive">{formatVnd(balance)}</Badge>
                      ) : balance < 0 ? (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                          Ứng trước {formatVnd(-balance)}
                        </Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Đủ</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setFormTarget(s)}
                          aria-label={`Sửa ${s.name}`}
                          title="Sửa thông tin"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-700 hover:text-emerald-800"
                          onClick={() => setPayTarget(s)}
                          aria-label={`Trả tiền cho ${s.name}`}
                          title="Trả tiền NCC"
                        >
                          <Banknote className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-amber-700 hover:text-amber-800"
                          onClick={() => setAdjustTarget(s)}
                          aria-label={`Điều chỉnh công nợ ${s.name}`}
                          title="Điều chỉnh công nợ"
                        >
                          <Scale className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setLedgerTarget(s)}
                          aria-label={`Sổ cái ${s.name}`}
                          title="Sổ cái công nợ"
                        >
                          <BookOpen className="h-4 w-4" />
                        </Button>
                        {s.is_active === 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(s)}
                            aria-label={`Vô hiệu hóa ${s.name}`}
                            title="Vô hiệu hóa"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Dialogs */}
      <SupplierFormDialog
        supplier={showForm ? formTarget : null}
        onClose={() => setShowForm(false)}
        onSaved={() => load(query.trim(), onlyOwing)}
      />
      <SupplierPaymentDialog
        supplier={payTarget}
        userId={userId}
        onClose={() => setPayTarget(null)}
        onSaved={() => load(query.trim(), onlyOwing)}
      />
      <SupplierAdjustDialog
        supplier={adjustTarget}
        userId={userId}
        onClose={() => setAdjustTarget(null)}
        onSaved={() => load(query.trim(), onlyOwing)}
      />
      <SupplierLedgerDialog supplier={ledgerTarget} onClose={() => setLedgerTarget(null)} />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vô hiệu hóa "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              NCC sẽ bị ẩn khỏi danh sách chọn khi tạo phiếu nhập. Lịch sử nhập hàng và sổ cái công
              nợ vẫn được giữ nguyên. Không thể vô hiệu hóa nếu NCC còn công nợ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeactivate}
            >
              Vô hiệu hóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
