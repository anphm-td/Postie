// ============================================================================
//  Postie POS - Login screen
// ----------------------------------------------------------------------------
//  Real login: the cashier enters username + password, verified against the
//  bcrypt hash in the DB via api.users.login. On success AuthContext stores
//  the session. Follows the same Card layout as ShiftOpen.
// ============================================================================

import React, { useState } from 'react'
import { useAuth } from '@renderer/context/AuthContext'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'

export function Login() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Vui lòng nhập tên đăng nhập và mật khẩu.')
      return
    }
    setSubmitting(true)
    try {
      const ok = await login(username.trim(), password)
      if (!ok) setError('Tên đăng nhập hoặc mật khẩu không đúng.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể đăng nhập.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-secondary/30">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
          <CardDescription>Nhập thông tin để bắt đầu ca làm việc.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Tên đăng nhập</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
