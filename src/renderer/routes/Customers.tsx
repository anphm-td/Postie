import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Search, Pencil, History, HandCoins, Scale, UsersRound, PartyPopper } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@renderer/components/ui/table'
import { AddCustomerDialog } from '@renderer/components/customers/AddCustomerDialog'
import { EditCustomerDialog } from '@renderer/components/customers/EditCustomerDialog'
import { RecordPaymentDialog } from '@renderer/components/customers/RecordPaymentDialog'
import { LedgerDialog } from '@renderer/components/customers/LedgerDialog'
import { AdjustDebtDialog } from '@renderer/components/customers/AdjustDebtDialog'
import type { Customer, CustomerSummary } from '@shared/types'

type Filter = 'all' | 'debt'

export function Customers() {
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [summary, setSummary] = useState<CustomerSummary | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editTarget, setEditTarget] = useState<Customer | null>(null)
  const [payTarget, setPayTarget] = useState<Customer | null>(null)
  const [ledgerTarget, setLedgerTarget] = useState<Customer | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<Customer | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isManager = (user?.role ?? 2) <= 1

  const load = useCallback(async (search: string, f: Filter) => {
    setLoading(true)
    try {
      const res = await api.customers.list({
        search: search || undefined,
        onlyDebtors: f === 'debt',
        pageSize: 200
      })
      setCustomers(res.items)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await api.customers.getSummary())
    } catch {
      setSummary(null)
    }
  }, [])

  const refreshAll = useCallback(() => {
    void load(query.trim(), filter)
    void loadSummary()
  }, [load, loadSummary, query, filter])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      void load(query.trim(), filter)
      void loadSummary()
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, filter, load, loadSummary])

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-card px-6 py-4">
        <h1 className="text-xl font-bold">Khách hàng &amp; công nợ</h1>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Thêm khách hàng
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 px-6 pt-4">
        <SummaryCard label="Khách đang hoạt động" value={summary ? String(summary.active_customers) : '—'} />
        <SummaryCard label="Khách còn nợ" value={summary ? String(summary.debtor_count) : '—'} />
        <SummaryCard
          label="Tổng phải thu"
          value={summary ? formatVnd(summary.total_outstanding) : '—'}
          mono
          highlight={(summary?.total_outstanding ?? 0) > 0}
        />
      </div>

      <div className="flex items-center justify-between gap-4 px-6 py-4">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo tên hoặc số điện thoại…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          <button
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
            onClick={() => setFilter('all')}
          >
            Tất cả
          </button>
          <button
            className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
              filter === 'debt' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
            }`}
            onClick={() => setFilter('debt')}
          >
            Chỉ còn nợ
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          filter === 'debt' && !query.trim() ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                <PartyPopper className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="font-medium">Không có khách nào còn nợ</p>
              <p className="text-sm text-muted-foreground">Công nợ đang sạch bong.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                <UsersRound className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-medium">Chưa có khách hàng nào</p>
              <p className="text-sm text-muted-foreground">
                Thêm khách để bán chịu và theo dõi công nợ.
              </p>
              <Button onClick={() => setShowAdd(true)} className="mt-1">
                <Plus className="mr-1 h-4 w-4" />
                Thêm khách hàng
              </Button>
            </div>
          )
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Số điện thoại</TableHead>
                  <TableHead className="text-right">Dư nợ</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id} className={c.is_active === 0 ? 'opacity-60' : undefined}>
                    <TableCell>
                      <span className="font-medium">{c.name}</span>
                      {c.is_active === 0 && <Badge variant="outline" className="ml-2">Đã tắt</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone || '—'}</TableCell>
                    <TableCell className="text-right font-mono font-semibold tabular-nums">
                      <DebtCell balance={c.balance} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-700 hover:text-emerald-800"
                          onClick={() => setPayTarget(c)}
                          disabled={c.is_active === 0}
                          aria-label={`Thu nợ ${c.name}`}
                        >
                          <HandCoins className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setLedgerTarget(c)}
                          aria-label={`Xem sổ cái của ${c.name}`}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {isManager && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-amber-700 hover:text-amber-800"
                            onClick={() => setAdjustTarget(c)}
                            disabled={c.is_active === 0}
                            aria-label={`Điều chỉnh công nợ ${c.name}`}
                          >
                            <Scale className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setEditTarget(c)}
                          aria-label={`Chỉnh sửa ${c.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AddCustomerDialog open={showAdd} onClose={() => setShowAdd(false)} onCreated={refreshAll} />
      <EditCustomerDialog customer={editTarget} onClose={() => setEditTarget(null)} onUpdated={refreshAll} />
      <RecordPaymentDialog customer={payTarget} userId={user?.id ?? 0} onClose={() => setPayTarget(null)} onUpdated={refreshAll} />
      <LedgerDialog customer={ledgerTarget} onClose={() => setLedgerTarget(null)} />
      {isManager && (
        <AdjustDebtDialog customer={adjustTarget} userId={user?.id ?? 0} onClose={() => setAdjustTarget(null)} onUpdated={refreshAll} />
      )}
    </div>
  )
}

function DebtCell({ balance }: { balance: number }) {
  if (balance > 0) return <span className="text-destructive">{formatVnd(balance)}</span>
  if (balance < 0) {
    return (
      <span className="text-emerald-600" title="Cửa hàng nợ lại khách">
        −{formatVnd(-balance)}
      </span>
    )
  }
  return <span className="font-sans font-normal text-muted-foreground">—</span>
}

function SummaryCard({
  label,
  value,
  mono,
  highlight
}: {
  label: string
  value: string
  mono?: boolean
  highlight?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div
          className={`mt-1 text-xl font-bold ${mono ? 'font-mono tabular-nums' : ''} ${
            highlight ? 'text-destructive' : ''
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  )
}
