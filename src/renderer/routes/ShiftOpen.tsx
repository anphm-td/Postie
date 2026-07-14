// ============================================================================
//  Postie POS - Open shift screen
// ----------------------------------------------------------------------------
//  Shown when the logged-in cashier has no active shift. The cashier enters
//  the opening cash float (tiền đầu ca trong két), then api.shifts.open
//  creates the shift row. On success AuthContext.refreshShift() picks it up
//  and App.tsx routes into the Register.
// ============================================================================

import React, { useState } from 'react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'

export function ShiftOpen() {
  const { user, refreshShift } = useAuth()
  // Input in đồng (not cents) for friendlier entry; converted on submit.
  const [dongStr, setDongStr] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!user) return
    const dong = Number(dongStr.replace(/[^\d]/g, ''))
    if (!Number.isFinite(dong) || dong < 0) {
      setError('Tiền đầu ca không hợp lệ.')
      return
    }
    setSubmitting(true)
    try {
      await api.shifts.open(user.id, Math.round(dong * 100))
      await refreshShift()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không mở được ca.')
    } finally {
      setSubmitting(false)
    }
  }

  const previewCents = Math.round(Number(dongStr.replace(/[^\d]/g, '') || 0) * 100)

  return (
    <div className="flex h-screen items-center justify-center bg-secondary/30">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Mở ca làm việc</CardTitle>
          <CardDescription>
            Nhập số tiền mặt đầu ca trong két sổ, {user?.display_name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="opening">Tiền đầu ca (₫)</Label>
              <Input
                id="opening"
                inputMode="numeric"
                value={dongStr}
                onChange={(e) => setDongStr(e.target.value)}
                placeholder="0"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Tương đương: {formatVnd(previewCents)}
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Đang mở ca…' : 'Mở ca'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
