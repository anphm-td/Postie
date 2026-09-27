import { useEffect, useState } from 'react'
import { api } from '@renderer/lib/api'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { Badge } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@renderer/components/ui/dialog'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@renderer/components/ui/table'
import type { Customer, CustomerLedgerEntry, CustomerLedgerType } from '@shared/types'

interface LedgerDialogProps {
  customer: Customer | null
  onClose: () => void
}

const TYPE_LABEL: Record<CustomerLedgerType, string> = {
  0: 'Nợ bán hàng',
  1: 'Thanh toán',
  2: 'Điều chỉnh'
}

const TYPE_VARIANT: Record<CustomerLedgerType, 'destructive' | 'default' | 'secondary'> = {
  0: 'destructive',
  1: 'default',
  2: 'secondary'
}

function AmountCell({ amount }: { amount: number }) {
  if (amount > 0) {
    return <span className="font-semibold text-destructive">+{formatVnd(amount)}</span>
  }
  return <span className="font-semibold text-emerald-600">−{formatVnd(-amount)}</span>
}

export function LedgerDialog({ customer, onClose }: LedgerDialogProps) {
  const [entries, setEntries] = useState<CustomerLedgerEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!customer) return
    let cancelled = false
    setLoading(true)
    api.customers.getLedger(customer.id, 200)
      .then((rows) => { if (!cancelled) setEntries(rows) })
      .catch(() => { if (!cancelled) setEntries([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [customer])

  if (!customer) return null

  return (
    <Dialog open={customer !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sổ cái công nợ</DialogTitle>
          <DialogDescription>
            {customer.name} — dư nợ hiện tại{' '}
            <b
              className={`font-mono tabular-nums ${
                customer.balance > 0 ? 'text-destructive' : 'text-foreground'
              }`}
            >
              {formatVnd(customer.balance)}
            </b>
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Thời gian</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead className="text-right">Số tiền</TableHead>
                <TableHead>Hóa đơn</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">Đang tải…</TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Chưa có phát sinh công nợ nào.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={TYPE_VARIANT[e.type]}>{TYPE_LABEL[e.type]}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      <AmountCell amount={e.amount} />
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {e.invoice_no != null ? `#${e.invoice_no}` : '—'}
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground" title={e.note ?? undefined}>
                      {e.note ?? '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
