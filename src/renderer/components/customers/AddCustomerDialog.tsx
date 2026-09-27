import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@renderer/components/ui/dialog'

interface AddCustomerDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function AddCustomerDialog({ open, onClose, onCreated }: AddCustomerDialogProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(''); setPhone(''); setEmail(''); setAddress('')
      setError(null); setSubmitting(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) {
      setError('Vui lòng nhập tên khách hàng.')
      return
    }
    setSubmitting(true)
    try {
      await api.customers.create({
        name,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null
      })
      toast.success(`Đã thêm khách hàng ${name.trim()}`)
      onCreated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không tạo được khách hàng. Thử lại nhé.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !submitting) onClose()
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Thêm khách hàng</DialogTitle>
          <DialogDescription>Tạo hồ sơ khách để bán chịu và theo dõi công nợ.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cust-name">Tên khách hàng *</Label>
            <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-phone">Số điện thoại</Label>
            <Input id="cust-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-email">Email</Label>
            <Input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cust-address">Địa chỉ</Label>
            <Input id="cust-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu…' : 'Thêm khách hàng'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
