import { useEffect, useMemo, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { toast } from 'sonner'
import { Printer } from 'lucide-react'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

/** Một tem cần in — dạng phẳng để gọi được từ mọi nguồn (Products, phiếu kiểm). */
export interface BarcodePrintItem {
  id: number
  name: string
  barcode: string | null
  price: number
  qty: number
}

interface BarcodePrintDialogProps {
  open: boolean
  items: BarcodePrintItem[]
  onClose: () => void
}

const MAX_TOTAL_LABELS = 1000

/**
 * In tem mã vạch (P1.7 — JsBarcode + window.print()):
 *  - Khổ tem 40x20mm (@page size 40mm 20mm, margin 0).
 *  - Mỗi sản phẩm in theo số lượng chọn (mặc định 1, tối đa tổng 1000 tem).
 *  - Tem: tên SP, giá bán, mã vạch CODE128 + số mã. SP không có mã vạch bị
 *    bỏ qua khi in (hiện cảnh báo trong dialog).
 *  - Chỉ @renderer/components/inventory chèn <style> in — không đụng index.css.
 */
export function BarcodePrintDialog({ open, items, onClose }: BarcodePrintDialogProps) {
  const [qtyById, setQtyById] = useState<Record<number, string>>({})
  const svgRefs = useRef(new Map<string, SVGSVGElement>())

  // Reset số lượng về mặc định mỗi lần mở dialog với bộ items mới.
  useEffect(() => {
    if (open) {
      const next: Record<number, string> = {}
      for (const it of items) next[it.id] = String(it.qty)
      setQtyById(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const labels = useMemo(() => {
    const out: Array<{ key: string; name: string; price: number; barcode: string }> = []
    for (const it of items) {
      const bc = (it.barcode || '').trim()
      if (!bc) continue
      const qty = Math.min(999, Math.max(1, Math.floor(Number(qtyById[it.id]) || 0)))
      for (let i = 0; i < qty; i++) {
        out.push({ key: `${it.id}-${i}`, name: it.name, price: it.price, barcode: bc })
      }
    }
    return out
  }, [items, qtyById])

  const signature = useMemo(() => labels.map((l) => l.key).join('|'), [labels])

  // Render mã vạch sau khi DOM mount/cập nhật.
  useEffect(() => {
    if (!open) return
    for (const label of labels) {
      const svg = svgRefs.current.get(label.key)
      if (!svg) continue
      try {
        JsBarcode(svg, label.barcode, {
          format: 'CODE128',
          width: 1.15,
          height: 30,
          displayValue: true,
          fontSize: 9,
          textMargin: 0,
          margin: 0
        })
      } catch {
        // Mã không hợp lệ cho CODE128 — bỏ qua tem này, vẫn in các tem khác.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signature])

  const skipped = items.filter((it) => !(it.barcode || '').trim())
  const totalQty = labels.length

  function setQty(id: number, raw: string) {
    setQtyById((prev) => ({ ...prev, [id]: raw.replace(/\D/g, '').slice(0, 3) }))
  }

  function handlePrint() {
    if (totalQty === 0) {
      toast.error('Chưa có tem nào để in (sản phẩm không có mã vạch hoặc số lượng = 0).')
      return
    }
    if (totalQty > MAX_TOTAL_LABELS) {
      toast.error(`Tổng số tem vượt ${MAX_TOTAL_LABELS}. Hãy giảm số lượng.`)
      return
    }
    window.print()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5 text-primary" />
            In tem mã vạch (40×20mm)
          </DialogTitle>
          <DialogDescription>
            {items.length} sản phẩm · {totalQty} tem sẽ in. Tem gồm tên hàng, giá bán và mã vạch
            CODE128 dùng cho máy quét khi bán.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-2 overflow-auto rounded-lg border p-3">
          {items.map((it) => {
            const noBarcode = !(it.barcode || '').trim()
            return (
              <div key={it.id} className="flex items-center gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{it.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {it.barcode || 'Không có mã vạch — sẽ bỏ qua khi in'}
                    {noBarcode && <span className="text-destructive"> ⚠</span>}
                  </p>
                </div>
                <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatVnd(it.price)}
                </span>
                <div className="flex w-28 items-center gap-1.5">
                  <Input
                    value={qtyById[it.id] ?? '1'}
                    onChange={(e) => setQty(it.id, e.target.value)}
                    disabled={noBarcode}
                    inputMode="numeric"
                    className="h-8 text-right"
                    aria-label={`Số lượng tem cho ${it.name}`}
                  />
                </div>
              </div>
            )
          })}
          {skipped.length > 0 && (
            <p className="text-xs text-amber-700">
              ⚠ {skipped.length} sản phẩm không có mã vạch sẽ bị bỏ qua. Hãy bổ sung mã vạch trong
              phần sửa sản phẩm trước khi in tem.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose}>
            Đóng
          </Button>
          <Button onClick={handlePrint} disabled={totalQty === 0}>
            <Printer className="mr-1 h-4 w-4" />
            In {totalQty} tem
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Khu vực in: ẩn trên màn hình, hiện duy nhất khi window.print().
          @page 40x20mm — mỗi tem chiếm đúng một trang tem. */}
      <style>{`
        @media print {
          @page { size: 40mm 20mm; margin: 0; }
          body * { visibility: hidden !important; }
          #postie-label-sheet, #postie-label-sheet * { visibility: visible !important; }
          #postie-label-sheet {
            position: absolute !important;
            left: 0; top: 0; width: 40mm;
            display: block !important;
          }
          .postie-label {
            width: 40mm; height: 20mm;
            box-sizing: border-box;
            padding: 1mm 1.5mm;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            display: flex; flex-direction: column;
            align-items: center; justify-content: space-between;
            font-family: 'Be Vietnam Pro', sans-serif;
          }
          .postie-label:last-child { page-break-after: auto; break-after: auto; }
          .postie-label-name {
            width: 100%; font-size: 6.5pt; font-weight: 600; line-height: 1.15;
            text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .postie-label-price { font-size: 7.5pt; font-weight: 700; line-height: 1.1; }
          .postie-label svg { max-width: 100%; height: auto; display: block; }
        }
      `}</style>
      <div id="postie-label-sheet" className="hidden" aria-hidden>
        {labels.map((l) => (
          <div key={l.key} className="postie-label">
            <div className="postie-label-name">{l.name}</div>
            <svg
              ref={(el) => {
                if (el) svgRefs.current.set(l.key, el)
                else svgRefs.current.delete(l.key)
              }}
            />
            <div className="postie-label-price">{formatVnd(l.price)}</div>
          </div>
        ))}
      </div>
    </Dialog>
  )
}

