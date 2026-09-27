// ============================================================================
//  Cấu hình cửa hàng (in hóa đơn 80mm P0.3 + tài khoản nhận QR P1.6).
//  STUB: lưu localStorage máy quầy — app chưa có IPC app_settings (grep
//  electron/ipc.ts không thấy namespace settings). Phase tích hợp sẽ chuyển
//  sang bảng app_settings khi có IPC đọc/ghi.
// ============================================================================

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { loadStoreConfig, saveStoreConfig, type StoreConfig } from './storeConfig'

interface StoreConfigDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (cfg: StoreConfig) => void
}

export function StoreConfigDialog({ open, onClose, onSaved }: StoreConfigDialogProps) {
  const [cfg, setCfg] = useState<StoreConfig>(loadStoreConfig)

  useEffect(() => {
    if (open) setCfg(loadStoreConfig())
  }, [open])

  function set<K extends keyof StoreConfig>(key: K, value: string) {
    setCfg((prev) => ({ ...prev, [key]: value }))
  }

  function handleSave() {
    const bin = cfg.qr_bank_bin.trim()
    const acc = cfg.qr_account_no.replace(/\s+/g, '')
    if (bin && !/^\d{6}$/.test(bin)) {
      toast.error('Mã BIN ngân hàng phải gồm 6 chữ số (VD: 970422).')
      return
    }
    if (acc && !/^[A-Za-z0-9]{6,19}$/.test(acc)) {
      toast.error('Số tài khoản không hợp lệ (6–19 chữ/số).')
      return
    }
    saveStoreConfig({ ...cfg, qr_bank_bin: bin, qr_account_no: acc })
    toast.success('Đã lưu cấu hình cửa hàng')
    onSaved({ ...cfg, qr_bank_bin: bin, qr_account_no: acc })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cấu hình cửa hàng</DialogTitle>
          <DialogDescription>
            Thông tin in lên hóa đơn 80mm và tài khoản nhận tiền QR. Cấu hình lưu trên máy quầy này.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-name">Tên cửa hàng</Label>
            <Input
              id="cfg-name"
              value={cfg.store_name}
              onChange={(e) => set('store_name', e.target.value)}
              placeholder="Postie POS"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-address">Địa chỉ</Label>
            <Input
              id="cfg-address"
              value={cfg.store_address}
              onChange={(e) => set('store_address', e.target.value)}
              placeholder="123 đường ABC, quận…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-phone">Điện thoại</Label>
              <Input
                id="cfg-phone"
                value={cfg.store_phone}
                onChange={(e) => set('store_phone', e.target.value)}
                placeholder="090…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-bin">BIN ngân hàng (QR)</Label>
              <Input
                id="cfg-bin"
                value={cfg.qr_bank_bin}
                onChange={(e) => set('qr_bank_bin', e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="970422"
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-account">Số tài khoản nhận QR</Label>
            <Input
              id="cfg-account"
              value={cfg.qr_account_no}
              onChange={(e) => set('qr_account_no', e.target.value)}
              placeholder="VD: 0123456789"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cfg-footer">Dòng chân hóa đơn</Label>
            <Input
              id="cfg-footer"
              value={cfg.receipt_footer}
              onChange={(e) => set('receipt_footer', e.target.value)}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Để trống BIN/số tài khoản nếu không dùng QR. (Stub — chờ IPC app_settings để đồng bộ
            giữa các máy.)
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button onClick={handleSave}>Lưu cấu hình</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
