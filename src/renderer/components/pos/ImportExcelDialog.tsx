import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  FileSpreadsheet,
  Download,
  Upload,
  CircleCheck,
  RefreshCw,
  TriangleAlert
} from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { api } from '@renderer/lib/api'
import { formatVnd } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@renderer/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
import type { ImportCommitResult, ImportRowPreview } from '@shared/types'

const BATCH_SIZE = 20

interface ImportExcelDialogProps {
  open: boolean
  onClose: () => void
  onDone: () => void
}

type Step = 'pick' | 'preview' | 'running' | 'done'

export function ImportExcelDialog({ open, onClose, onDone }: ImportExcelDialogProps) {
  const { user } = useAuth()
  const [step, setStep] = useState<Step>('pick')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ImportRowPreview[]>([])
  const [unmapped, setUnmapped] = useState<string[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<ImportCommitResult | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setStep('pick')
    setFileName('')
    setRows([])
    setUnmapped([])
    setProgress({ done: 0, total: 0 })
    setResult(null)
    setError(null)
    setPicking(false)
  }

  function handleClose() {
    if (step === 'running') return
    reset()
    onClose()
  }

  async function handlePick() {
    setError(null)
    setPicking(true)
    try {
      const picked = await api.products.importPick()
      if (!picked) {
        setPicking(false)
        return
      }
      setFileName(picked.fileName)
      setRows(picked.rows)
      setUnmapped(picked.unmappedHeaders)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không đọc được file. Kiểm tra lại định dạng.')
    } finally {
      setPicking(false)
    }
  }

  async function handleDownloadTemplate() {
    try {
      const saved = await api.products.importTemplate()
      if (saved) toast.success(`Đã lưu file mẫu: ${saved.split(/[\\/]/).pop()}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không lưu được file mẫu.')
    }
  }

  const validRows = useMemo(() => rows.filter((r) => r.status !== 'error'), [rows])
  const newCount = useMemo(() => rows.filter((r) => r.status === 'new').length, [rows])
  const updateCount = useMemo(() => rows.filter((r) => r.status === 'update').length, [rows])
  const errorCount = useMemo(() => rows.filter((r) => r.status === 'error').length, [rows])

  async function handleCommit() {
    setStep('running')
    setProgress({ done: 0, total: validRows.length })
    const accumulated: ImportCommitResult = { imported: 0, updated: 0, failed: [] }
    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE)
      try {
        const res = await api.products.importCommit(batch, user?.id ?? 0)
        accumulated.imported += res.imported
        accumulated.updated += res.updated
        accumulated.failed.push(...res.failed)
      } catch (err) {
        accumulated.failed.push(
          ...batch.map((r) => ({
            row: r.row,
            name: r.name,
            reason: err instanceof Error ? err.message : 'Lỗi không xác định'
          }))
        )
      }
      setProgress({ done: Math.min(i + BATCH_SIZE, validRows.length), total: validRows.length })
    }
    setResult(accumulated)
    setStep('done')
    if (accumulated.failed.length === 0) {
      toast.success(`Đã nhập ${accumulated.imported} mới, cập nhật ${accumulated.updated}`)
    } else {
      toast.warning(
        `Nhập xong với ${accumulated.failed.length} dòng lỗi — xem chi tiết trong kết quả`
      )
    }
  }

  function handleFinish() {
    onDone()
    handleClose()
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose()
      }}
    >
      <DialogContent className="max-w-2xl">
        {step === 'pick' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Nhập hàng từ file Excel
              </DialogTitle>
              <DialogDescription>
                Hỗ trợ file .xlsx và .csv. Dòng có mã vạch trùng sẽ được cập nhật theo số liệu trong
                file.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-dashed bg-muted/40 p-6 text-center">
              <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">Chọn file để xem trước trước khi nhập</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cột: Tên sản phẩm · Mã vạch · Số lượng · Giá gốc · Giá bán · Đơn vị
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button onClick={handlePick} disabled={picking}>
                  <Upload className="mr-1.5 h-4 w-4" />
                  {picking ? 'Đang đọc file…' : 'Chọn file'}
                </Button>
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  <Download className="mr-1.5 h-4 w-4" />
                  Tải file mẫu
                </Button>
              </div>
            </div>
            {error && <p className="text-sm leading-relaxed text-destructive">{error}</p>}
          </>
        )}

        {step === 'preview' && (
          <>
            <DialogHeader>
              <DialogTitle>Xem trước — {fileName}</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-emerald-700">{newCount} mới</span>
                {' · '}
                <span className="font-medium text-amber-700">{updateCount} cập nhật</span>
                {' · '}
                <span className="font-medium text-destructive">{errorCount} lỗi</span>
                {unmapped.length > 0 && (
                  <span className="block text-xs">
                    Bỏ qua cột không nhận dạng: {unmapped.join(', ')}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[45vh] overflow-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12">Dòng</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Mã vạch</TableHead>
                    <TableHead className="text-right">Tồn</TableHead>
                    <TableHead className="text-right">Giá bán</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.row} className={r.status === 'error' ? 'bg-destructive/5' : undefined}>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                        {r.row}
                      </TableCell>
                      <TableCell className="max-w-44 truncate font-medium" title={r.name}>
                        {r.name || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.barcode || '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{r.stock}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVnd(r.price)}
                      </TableCell>
                      <TableCell>
                        {r.status === 'new' && <Badge className="bg-emerald-600 text-white">Mới</Badge>}
                        {r.status === 'update' && (
                          <Badge className="bg-amber-500 text-white">Cập nhật</Badge>
                        )}
                        {r.status === 'error' && (
                          <span className="text-xs font-medium text-destructive">{r.error}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Chọn file khác
              </Button>
              <Button onClick={handleCommit} disabled={validRows.length === 0}>
                Nhập {validRows.length} dòng
              </Button>
            </div>
          </>
        )}

        {step === 'running' && (
          <>
            <DialogHeader>
              <DialogTitle>Đang nhập hàng…</DialogTitle>
              <DialogDescription>
                Vui lòng giữ ứng dụng mở cho đến khi hoàn tất.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-center font-mono text-sm tabular-nums text-muted-foreground">
                {progress.done} / {progress.total} dòng
              </p>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {result.failed.length === 0 ? (
                  <CircleCheck className="h-5 w-5 text-emerald-600" />
                ) : (
                  <TriangleAlert className="h-5 w-5 text-amber-600" />
                )}
                Kết quả nhập
              </DialogTitle>
              <DialogDescription>
                Đã thêm <b className="text-emerald-700">{result.imported}</b> sản phẩm mới · cập
                nhật <b className="text-amber-700">{result.updated}</b> · lỗi{' '}
                <b className="text-destructive">{result.failed.length}</b>
              </DialogDescription>
            </DialogHeader>
            {result.failed.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-12">Dòng</TableHead>
                      <TableHead>Tên</TableHead>
                      <TableHead>Lý do</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.failed.map((f) => (
                      <TableRow key={f.row}>
                        <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                          {f.row}
                        </TableCell>
                        <TableCell className="max-w-40 truncate" title={f.name}>
                          {f.name || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-destructive">{f.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Nhập file khác
              </Button>
              <Button onClick={handleFinish}>Xong</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
