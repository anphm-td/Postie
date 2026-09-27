import { useEffect, useState, type RefObject } from 'react'
import { Users, X } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import type { Customer } from '@shared/types'

interface CustomerPickerProps {
  customer: Customer | null
  onSelect: (customer: Customer | null) => void
  /** Ref của ô nhập — Register dùng để focus khi nhấn F4. */
  inputRef?: RefObject<HTMLInputElement>
}

export function CustomerPicker({ customer, onSelect, inputRef }: CustomerPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (customer) return
    const q = query.trim()
    const t = setTimeout(async () => {
      try {
        const res = await api.customers.list({ search: q || undefined, activeOnly: true, pageSize: 5 })
        setResults(res.items)
      } catch {
        setResults([])
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, customer])

  if (customer) {
    return (
      <div className="flex items-center justify-between rounded-lg border bg-secondary/50 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{customer.name}</div>
          <div className="text-xs text-muted-foreground">
            {customer.phone || 'Không có SĐT'}
            {customer.balance > 0 && (
              <span className="ml-1 text-destructive">· đang nợ {formatVnd(customer.balance)}</span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => onSelect(null)}
          aria-label="Bỏ chọn khách hàng"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Chọn khách hàng (tùy chọn)…"
        className="pl-9"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-lg animate-slide-up">
          {results.map((c) => (
            <button
              key={c.id}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(c)
                setQuery('')
                setResults([])
                setOpen(false)
              }}
            >
              <span className="truncate font-medium">{c.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {c.phone || '—'}
                {c.balance > 0 ? ` · nợ ${formatVnd(c.balance)}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
