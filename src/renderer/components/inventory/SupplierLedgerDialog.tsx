import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatDateTime, formatVnd } from '@renderer/lib/format'
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
import { PO_STATUS_META, SUPPLIER_LEDGER_TYPE_LABELS, formatSignedVnd } from '@renderer/components/inventory/labels'
import type { Supplier, SupplierLedgerEntry } from '@shared/types'

interface SupplierLedgerDialogProps {
  supplier: Supplier | null
  onClose: () => void
}

/**
 * SỔ CÁI CÔNG NỢ NCC (P1.2 — suppliers:getLedger): mọi dòng ghi sổ (nợ nhập,
 * trả tiền, điều chỉnh) — mới nhất trước. balance là cột dẫn xuất nên sổ cái
 * là nguồn sự thật về công nợ; đọc thôi, không sửa.
 */
export function SupplierLedgerDialog({ supplier, onClose }: SupplierLedgerDialogProps) {
  const [entries, setEntries] = useState<SupplierLedgerEntry[]>([])
  const [loading, setLoading] = useState(false)
  const open = supplier !== null

  useEffect(() => {
    if (!supplier) return
    let cancelled = false
    setLoading(true)
    api.suppliers
      .getLedger(supplier.id, 200)
      .then((rows) => {
        if (!cancelled) setEntries(rows)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [supplier])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Sổ cái công nợ — {supplier?.name}
          </DialogTitle>
          <DialogDescription>
            {supplier?.balance != null && (
              <>
                Công nợ hiện tại:{' '}
                <span className="font-mono font-semibold">{formatVnd(Math.max(0, supplier.balance))}</span>
                {(supplier.balance ?? 0) < 0 && ' (đã trả trước / ứng trước)'}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Chưa có giao dịch công nợ nào với nhà cung cấp này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Thời điểm</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead className="text-right">Số tiền</TableHead>
                  <TableHead>Ghi chú</TableHead>
                  <TableHead>Phiếu nhập</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {SUPPLIER_LEDGER_TYPE_LABELS[e.type] ?? `Loại ${e.type}`}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-mono font-semibold tabular-nums',
                        e.amount > 0 ? 'text-destructive' : e.amount < 0 ? 'text-emerald-700' : ''
                      )}
                    >
                      {formatSignedVnd(e.amount)}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground" title={e.note ?? undefined}>
                      {e.note || '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.po_id != null ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="font-mono">#{e.po_id}</span>
                          {e.po_status != null && (
                            <Badge variant="secondary" className={PO_STATUS_META[e.po_status].badge}>
                              {PO_STATUS_META[e.po_status].label}
                            </Badge>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
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
