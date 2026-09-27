import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { Supplier } from '@shared/types'

interface SupplierFormDialogProps {
  /** null = thêm mới, có giá trị = sửa NCC này. */
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}

/** Thêm / sửa nhà cung cấp (P1.2 — suppliers:create / suppliers:update). */
export function SupplierFormDialog({ supplier, onClose, onSaved }: SupplierFormDialogProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [saving, setSaving] = useState(false)
  const open = supplier !== null

  useEffect(() => {
    if (supplier) {
      setName(supplier.name)
      setPhone(supplier.phone ?? '')
      setEmail(supplier.email ?? '')
      setAddress(supplier.address ?? '')
    } else {
      setName('')
      setPhone('')
      setEmail('')
      setAddress('')
    }
  }, [supplier])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên nhà cung cấp.')
      return
    }
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null
      }
      if (supplier) {
        await api.suppliers.update(supplier.id, input)
        toast.success('Đã cập nhật nhà cung cấp.')
      } else {
        await api.suppliers.create(input)
        toast.success(`Đã thêm nhà cung cấp "${input.name}".`)
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không lưu được nhà cung cấp.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</DialogTitle>
          <DialogDescription>
            Thông tin liên hệ dùng khi tạo phiếu nhập hàng và đối chiếu công nợ.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sup-name">Tên nhà cung cấp *</Label>
            <Input
              id="sup-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Coca-Cola Việt Nam"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-phone">Điện thoại</Label>
            <Input
              id="sup-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="VD: 0901234567"
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-email">Email</Label>
            <Input
              id="sup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="VD: banhang@ncc.vn"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sup-address">Địa chỉ</Label>
            <Input
              id="sup-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Địa chỉ liên hệ / giao hàng"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Hủy
            </Button>
            <Button type="submit" disabled={saving}>
              {supplier ? 'Lưu thay đổi' : 'Thêm NCC'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
