import React, { useState } from 'react'
import { Vault } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd, dongToCents } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { MoneyInput } from '@renderer/components/ui/money-input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'

export function ShiftOpen() {
  const { user, refreshShift } = useAuth()
  const [dongStr, setDongStr] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!user || submitting) return
    const cents = dongToCents(dongStr)
    setSubmitting(true)
    try {
      await api.shifts.open(user.id, cents)
      await refreshShift()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không mở được ca. Thử lại nhé.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground shadow-md">
            <Vault className="h-7 w-7" />
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">Mở ca làm việc</div>
            <div className="text-xs text-muted-foreground">Xin chào, {user?.display_name}</div>
          </div>
        </div>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-base">Tiền đầu ca</CardTitle>
            <CardDescription>
              Nhập số tiền mặt đang có trong két lúc mở ca. Cuối ca sẽ đối chiếu lại.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="opening">Tiền mặt trong két (₫)</Label>
                <MoneyInput
                  id="opening"
                  value={dongStr === '0' ? '' : dongStr}
                  onValueChange={(d) => setDongStr(d || '0')}
                  placeholder="0"
                  className="h-12 text-xl"
                  autoFocus
                  aria-label="Tiền đầu ca"
                />
                <p className="text-xs text-muted-foreground">
                  Tương đương:{' '}
                  <span className="font-mono font-semibold text-foreground">
                    {formatVnd(dongToCents(dongStr))}
                  </span>
                </p>
              </div>
              {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
              <Button type="submit" className="h-11 w-full" disabled={submitting}>
                {submitting ? 'Đang mở ca…' : 'Mở ca & bắt đầu bán'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
