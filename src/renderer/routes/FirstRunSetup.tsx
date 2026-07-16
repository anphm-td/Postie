// ============================================================================
//  Postie POS - First-run setup screen
// ----------------------------------------------------------------------------
//  Shown once, before Login, when the DB hasn't been created yet (fresh
//  install / freshly downloaded .exe) or exists but has no users. Lets the
//  store owner set the admin password through a normal form — this replaces
//  the old CLI `electron . --init-db` readline prompt, which cannot work once
//  the app is launched as a double-clicked packaged .exe (no terminal is
//  attached to read a password from).
// ============================================================================

import React, { useState } from 'react'
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
      setError(err instanceof Error ? err.message : 'Không thể khởi tạo cơ sở dữ liệu.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-secondary/30">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Thiết lập lần đầu</CardTitle>
          <CardDescription>
            Chào mừng đến với Postie POS. Đặt mật khẩu cho tài khoản quản trị (
            <span className="font-medium">admin</span>) để bắt đầu sử dụng.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu admin</Label>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Đang khởi tạo…' : 'Bắt đầu sử dụng'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
