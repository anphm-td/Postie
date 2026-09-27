// ============================================================================
//  Đơn treo lưu DB (P1.5 — docs/kiotviet-roadmap.md §5)
// ----------------------------------------------------------------------------
//  Trước đây đơn treo nằm trong useState của Register (mất khi restart app).
//  Giờ đọc/ghi qua orders:listHeld / hold / updateHeld / convertHeld /
//  voidOrder — orders.held_at là cột phân loại, status=0.
// ============================================================================

import { useEffect, useState } from 'react'
import { Ban, PauseCircle, Play } from 'lucide-react'
import { formatDateTime, formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import type { HeldBill } from '@shared/types'

interface HeldBillsBarProps {
  count: number
  canHold: boolean
  onHold: () => void
  onShowList: () => void
}

export function HeldBillsBar({ count, canHold, onHold, onShowList }: HeldBillsBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-dashed bg-muted/40 px-4 py-2.5">
      <Button
        variant="outline"
        size="sm"
        disabled={!canHold}
        onClick={onHold}
        className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800"
      >
        <PauseCircle className="h-4 w-4" />
        Treo đơn này
      </Button>

      {count > 0 && (
        <Button
          size="sm"
          onClick={onShowList}
          className="gap-1.5 bg-amber-500 text-white hover:bg-amber-600"
        >
          <PauseCircle className="h-4 w-4" />
          {count} đơn treo
        </Button>
      )}
    </div>
  )
}

interface HeldBillsDialogProps {
  open: boolean
  bills: HeldBill[]
  /** id của đơn đang xử lý (restore/pay/void) để khóa nút. */
  busyBillId: number | null
  onClose: () => void
  /** Mở dialog thanh toán cho đơn treo (convertHeld sau khi xác nhận). */
  onPay: (bill: HeldBill) => void
  /** Gọi đơn treo về giỏ để sửa — mọi thay đổi sẽ cập nhật qua updateHeld. */
  onRestore: (bill: HeldBill) => void
  /** Hủy bỏ đơn treo (orders:voidOrder — không khôi phục được). */
  onVoid: (bill: HeldBill) => void
}

export function HeldBillsDialog({
  open,
  bills,
  busyBillId,
  onClose,
  onPay,
  onRestore,
  onVoid
}: HeldBillsDialogProps) {
  const [confirmVoidId, setConfirmVoidId] = useState<number | null>(null)
  useEffect(() => {
    if (!open) setConfirmVoidId(null)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hóa đơn đang treo ({bills.length})</DialogTitle>
          <DialogDescription>
            Đơn treo lưu trong cơ sở dữ liệu — không mất khi khởi động lại ứng dụng.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {bills.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Không có đơn treo nào.</p>
          )}
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="rounded-lg border p-3 transition-colors hover:border-amber-400"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    #{bill.invoice_no} ·{' '}
                    <span className="font-mono tabular-nums">{formatVnd(bill.total)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Treo lúc {formatDateTime(bill.held_at)} · {bill.item_count ?? 0} món
                    {bill.customer_name ? ` · ${bill.customer_name}` : ''}
                  </div>
                </div>
                {confirmVoidId === bill.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busyBillId === bill.id}
                      onClick={() => {
                        setConfirmVoidId(null)
                        onVoid(bill)
                      }}
                    >
                      Xóa đơn
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmVoidId(null)}>
                      Thôi
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-700 text-white hover:bg-emerald-800"
                      disabled={busyBillId === bill.id}
                      onClick={() => onPay(bill)}
                    >
                      <Play className="h-3.5 w-3.5" />
                      Thanh toán
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyBillId === bill.id}
                      onClick={() => onRestore(bill)}
                    >
                      Gọi lại
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busyBillId === bill.id}
                      onClick={() => setConfirmVoidId(bill.id)}
                      aria-label={`Hủy đơn treo #${bill.invoice_no}`}
                      title="Hủy đơn treo"
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
