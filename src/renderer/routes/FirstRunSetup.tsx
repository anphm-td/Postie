import React, { useState } from 'react'
import { Store } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@renderer/components/ui/card'

interface FirstRunSetupProps {
  onDone: () => void
}

export function FirstRunSetup({ onDone }: FirstRunSetupProps) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.')
      return
    }
    if (password !== confirm) {
      setError('Hai mật khẩu không khớp.')
      setConfirm('')
      return
    }
    setSubmitting(true)
    try {
      await api.db.initialize(password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không khởi tạo được dữ liệu. Thử lại nhé.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground shadow-md">
            <Store className="h-7 w-7" />
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">Chào mừng đến Postie POS</div>
            <div className="text-xs text-muted-foreground">Thiết lập một lần, dùng ngay được</div>
          </div>
        </div>
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-base">Đặt mật khẩu quản trị</CardTitle>
            <CardDescription>
              Tài khoản <span className="font-medium">admin</span> sẽ dùng mật khẩu này để đăng
              nhập.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Nhập lại mật khẩu</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••"
                />
              </div>
              {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
              <Button type="submit" className="h-11 w-full" disabled={submitting}>
                {submitting ? 'Đang chuẩn bị…' : 'Bắt đầu sử dụng'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
