// ============================================================================
//  Postie POS - DateRangePicker: chọn khoảng thời gian cho màn Báo cáo
// ----------------------------------------------------------------------------
//  Preset: Hôm nay / 7 ngày / 30 ngày / Tháng này / Tháng trước / Tất cả +
//  chế độ "Tùy chọn" với 2 ô <input type="date"> (Chromium của Electron hỗ
//  trợ native — không cần thêm dependency lịch).
//  Giá trị là unix SECONDS theo giờ máy quầy (localtime) — khớp cách reports
//  repo đếm ngày (date(created_at,'unixepoch','localtime')).
// ============================================================================

import { useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

export interface DateRange {
  /** Unix seconds (bao gồm mốc); null = không chặn ngày bắt đầu. */
  from: number | null
  /** Unix seconds (bao gồm mốc, hết 23:59:59); null = đến hiện tại. */
  to: number | null
}

const DAY = 86_400

export function startOfDayUnix(unix: number): number {
  const d = new Date(unix * 1000)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

export function endOfDayUnix(unix: number): number {
  const d = new Date(unix * 1000)
  d.setHours(23, 59, 59, 999)
  return Math.floor(d.getTime() / 1000)
}

export type PresetId = 'today' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'all' | 'custom'

const PRESETS: Array<{ id: PresetId; label: string }> = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'thisMonth', label: 'Tháng này' },
  { id: 'lastMonth', label: 'Tháng trước' },
  { id: 'all', label: 'Tất cả' }
]

export function presetRange(id: PresetId): DateRange {
  const now = Math.floor(Date.now() / 1000)
  switch (id) {
    case 'today':
      return { from: startOfDayUnix(now), to: endOfDayUnix(now) }
    case '7d':
      return { from: startOfDayUnix(now - 6 * DAY), to: endOfDayUnix(now) }
    case '30d':
      return { from: startOfDayUnix(now - 29 * DAY), to: endOfDayUnix(now) }
    case 'thisMonth': {
      const d = new Date(now * 1000)
      const first = new Date(d.getFullYear(), d.getMonth(), 1)
      return { from: startOfDayUnix(Math.floor(first.getTime() / 1000)), to: endOfDayUnix(now) }
    }
    case 'lastMonth': {
      const d = new Date(now * 1000)
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1)
      const last = new Date(d.getFullYear(), d.getMonth(), 0) // ngày cuối tháng trước
      return {
        from: startOfDayUnix(Math.floor(first.getTime() / 1000)),
        to: endOfDayUnix(Math.floor(last.getTime() / 1000))
      }
    }
    case 'all':
    default:
      return { from: null, to: null }
  }
}

function sameRange(a: DateRange, b: DateRange): boolean {
  return (a.from ?? null) === (b.from ?? null) && (a.to ?? null) === (b.to ?? null)
}

function toDateInputValue(unix: number | null): string {
  if (unix == null) return ''
  const d = new Date(unix * 1000)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function parseDateInput(value: string, endOfDay: boolean): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const unix = Math.floor(new Date(y, mo - 1, d).getTime() / 1000)
  return endOfDay ? endOfDayUnix(unix) : startOfDayUnix(unix)
}

/** Mô tả khoảng thời gian bằng chữ — hiển thị cạnh tiêu đề màn Báo cáo. */
export function describeRange(range: DateRange): string {
  const fmt = (unix: number) =>
    new Date(unix * 1000).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  if (range.from == null && range.to == null) return 'Toàn bộ thời gian'
  if (range.from != null && range.to != null) return `${fmt(range.from)} → ${fmt(range.to)}`
  if (range.from != null) return `Từ ${fmt(range.from)}`
  return `Đến ${fmt(range.to as number)}`
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
}

const chipBase = 'rounded-md px-3 py-1.5 text-sm font-medium transition-colors'
const chipActive = 'bg-primary text-primary-foreground'
const chipIdle = 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [customOpen, setCustomOpen] = useState(false)

  const activePreset = useMemo<PresetId>(() => {
    for (const p of PRESETS) {
      if (sameRange(value, presetRange(p.id))) return p.id
    }
    return 'custom'
  }, [value])

  const isCustom = activePreset === 'custom'
  const showCustomInputs = customOpen || (isCustom && (value.from != null || value.to != null))

  function pickPreset(id: PresetId) {
    setCustomOpen(false)
    onChange(presetRange(id))
  }

  function setFromInput(raw: string) {
    const from = parseDateInput(raw, false)
    if (from == null) return
    setCustomOpen(true)
    onChange({ from, to: value.to ?? endOfDayUnix(Math.floor(Date.now() / 1000)) })
  }

  function setToInput(raw: string) {
    const to = parseDateInput(raw, true)
    if (to == null) return
    setCustomOpen(true)
    onChange({ from: value.from ?? startOfDayUnix(to), to })
  }

  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <CalendarDays className="mr-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => pickPreset(p.id)}
            className={cn(chipBase, activePreset === p.id ? chipActive : chipIdle)}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setCustomOpen((o) => !o)}
          className={cn(
            chipBase,
            isCustom ? chipActive : chipIdle,
            !isCustom && customOpen && 'bg-accent text-accent-foreground'
          )}
        >
          Tùy chọn
        </button>
      </div>
      {showCustomInputs && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Từ</span>
          <Input
            type="date"
            className="h-9 w-40"
            value={toDateInputValue(value.from)}
            max={toDateInputValue(value.to) || undefined}
            onChange={(e) => setFromInput(e.target.value)}
            aria-label="Từ ngày"
          />
          <span>đến</span>
          <Input
            type="date"
            className="h-9 w-40"
            value={toDateInputValue(value.to)}
            min={toDateInputValue(value.from) || undefined}
            onChange={(e) => setToInput(e.target.value)}
            aria-label="Đến ngày"
          />
        </div>
      )}
    </div>
  )
}
