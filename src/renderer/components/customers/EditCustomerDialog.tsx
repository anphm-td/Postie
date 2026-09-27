import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import type { Customer } from '@shared/types'

interface EditCustomerDialogProps {
  customer: Customer | null
  onClose: () => void
  onUpdated: () => void
}

export function EditCustomerDialog({ customer, onClose, onUpdated }: EditCustomerDialogProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  useEffect(() => {
    if (customer) {
      setName(customer.name)
      setPhone(customer.phone ?? '')
      setEmail(customer.email ?? '')
      setAddress(customer.address ?? '')
      setError(null)
      setSubmitting(false)
      setConfirmDeactivate(false)
    }
  }, [customer])

  if (!customer) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customer) return
    setError(null)
    if (!name.trim()) {
      setError('Vui lòng nhập tên khách hàng.')
      return
    }
    setSubmitting(true)
    try {
      await api.customers.update(customer.id, {
        name,
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null
      })
      toast.success('Đã lưu thông tin khách hàng')
      onUpdated()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Không lưu được thông tin. Thử lại nhé.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate() {
    if (!customer) return
    setConfirmDeactivate(false)
    setSubmitting(true)
    try {
      await api.customers.deactivate(customer.id)
      toast.success(`Đã ẩn ${customer.name} khỏi danh sách`)
      onUpdated()
      onClose()
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Không ẩn được khách hàng. Chỉ ẩn được khi dư nợ bằng 0.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Dialog
        open={customer !== null}
        onOpenChange={(o) => {
          if (!o && !submitting) onClose()
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sửa khách hàng</DialogTitle>
            <DialogDescription>
              {customer.name} — dư nợ hiện tại:{' '}
              <b
                className={`font-mono tabular-nums ${
                  customer.balance > 0 ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {formatVnd(customer.balance)}
              </b>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cust-name">Tên khách hàng *</Label>
              <Input id="edit-cust-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cust-phone">Số điện thoại</Label>
              <Input
                id="edit-cust-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cust-email">Email</Label>
              <Input
                id="edit-cust-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cust-address">Địa chỉ</Label>
              <Input
                id="edit-cust-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
            <DialogFooter className="gap-2 sm:gap-2">
              {customer.is_active === 1 && (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto text-destructive hover:text-destructive"
                  onClick={() => setConfirmDeactivate(true)}
                  disabled={submitting || customer.balance !== 0}
                  title={
                    customer.balance !== 0
                      ? 'Chỉ ẩn được khi dư nợ đã thu hết về 0.'
                      : 'Ẩn khách hàng khỏi danh sách (giữ lịch sử)'
                  }
                >
                  Vô hiệu hóa
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                Hủy
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeactivate} onOpenChange={setConfirmDeactivate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ẩn {customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Khách hàng sẽ biến mất khỏi danh sách và không chọn được khi bán chịu. Lịch sử công
              nợ vẫn được giữ nguyên.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeactivate}
            >
              Vô hiệu hóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
