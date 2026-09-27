// ============================================================================
//  Postie POS - ShiftHistoryPanel: LỊCH SỬ CA (P0.4)
// ----------------------------------------------------------------------------
//  Nguồn: api.shifts.list({ status, userId, limit }) → ShiftWithUser[] (mới
//  nhất trước) + api.users.list() cho bộ lọc thu ngân. Chỉ ĐỌC số đã chốt
//  (expected/counted/difference — shifts có CHECK ràng buộc đối ca).
//  Thu/chi tiền: chỉ ghi được trên ca ĐANG MỞ (repo chặn) — nút hiện khi có
//  activeShift; từng ca mở cũng mở được từ ShiftDetailDialog.
// ============================================================================

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/context/AuthContext'
import { formatVnd, formatDateTime } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import { EmptyState } from '@renderer/components/reports/EmptyState'
import { signedVnd } from '@renderer/components/reports/reportTypes'
import type { ShiftWithUser } from '@renderer/components/reports/reportTypes'
import type { User, Shift } from '@shared/types'
import { ShiftDetailDialog } from './ShiftDetailDialog'
import { ShiftCashEventDialog } from './ShiftCashEventDialog'

type StatusFilter = 'all' | 'open' | 'closed'

const STATUS_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'open', label: 'Đang mở' },
  { id: 'closed', label: 'Đã kết thúc' }
]

function StatusBadge({ status }: { status: number | null }) {
  if (status === 0) return <Badge className="bg-amber-500/15 text-amber-700">Đang mở</Badge>
  return <Badge variant="secondary">Đã kết thúc</Badge>
}

export function ShiftHistoryPanel() {
  const { activeShift } = useAuth()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [userFilter, setUserFilter] = useState<number | 'all'>('all')
  const [users, setUsers] = useState<User[]>([])
  const [rows, setRows] = useState<ShiftWithUser[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [detail, setDetail] = useState<ShiftWithUser | null>(null)
  const [cashShift, setCashShift] = useState<Shift | null>(null)

  // Danh sách thu ngân cho bộ lọc — nạp 1 lần, lỗi thì ẩn bộ lọc (không chặn).
  useEffect(() => {
    let cancelled = false
    api.users.list().then(
      (list) => {
        if (!cancelled) setUsers(list.filter((u) => u.is_active === 1))
      },
      () => {
        /* bỏ qua — panel vẫn dùng được không có bộ lọc nhân viên */
      }
    )
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api.shifts
      .list({
        status: statusFilter === 'open' ? 0 : statusFilter === 'closed' ? 1 : undefined,
        userId: userFilter === 'all' ? undefined : userFilter,
        limit: 100
      })
      .then((list) => {
        if (!cancelled) {
          setRows(list)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không tải được lịch sử ca.')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [statusFilter, userFilter, nonce])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setStatusFilter(opt.id)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  statusFilter === opt.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {users.length > 0 && (
            <select
              value={userFilter === 'all' ? 'all' : String(userFilter)}
              onChange={(e) =>
                setUserFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Lọc theo thu ngân"
            >
              <option value="all">Mọi thu ngân</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name}
                </option>
              ))}
            </select>
          )}
        </div>

        {activeShift && (
          <Button size="sm" onClick={() => setCashShift(activeShift)}>
            <Plus className="mr-1 h-4 w-4" />
            Thu / chi tiền ca hiện tại
          </Button>
        )}
      </div>

      {error ? (
        <p className="py-10 text-center text-sm text-destructive">{error}</p>
      ) : loading ? (
        <div className="space-y-2 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState title="Chưa có ca nào khớp bộ lọc" hint="Ca được tạo khi thu ngân mở ca làm việc." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Ca</TableHead>
                <TableHead>Thu ngân</TableHead>
                <TableHead>Mở lúc</TableHead>
                <TableHead>Kết thúc</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Tiền đầu ca</TableHead>
                <TableHead className="text-right">Dự kiến</TableHead>
                <TableHead className="text-right">Đếm được</TableHead>
                <TableHead className="text-right">Chênh lệch</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono font-medium">#{s.id}</TableCell>
                  <TableCell>{s.user_name ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(s.opened_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {s.closed_at != null ? formatDateTime(s.closed_at) : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatVnd(s.opening_cash)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {s.expected_cash != null ? formatVnd(s.expected_cash) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {s.counted_cash != null ? formatVnd(s.counted_cash) : '—'}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono font-semibold tabular-nums',
                      s.difference != null && s.difference !== 0 && 'text-destructive'
                    )}
                  >
                    {s.difference != null ? signedVnd(s.difference) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setDetail(s)}>
                      Chi tiết
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ShiftDetailDialog
        shift={detail}
        onClose={() => setDetail(null)}
        onAddCash={(s) => {
          setDetail(null)
          setCashShift(s)
        }}
      />
      <ShiftCashEventDialog
        shift={cashShift}
        onClose={() => setCashShift(null)}
        onSaved={() => setNonce((n) => n + 1)}
      />
    </div>
  )
}
