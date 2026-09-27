import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, RotateCcw, Tags, Trash2 } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@renderer/components/ui/table'
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
import type { Category } from '@shared/types'

const SELECT_CLS =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Quản lý DANH MỤC nhóm hàng phân cấp (P0.7 — categories repo có sẵn:
 * create/update/deactivate, soft-delete qua is_active, guard vòng lặp
 * trong repo). Dùng làm tab trong màn Kho hàng.
 */
export function CategoryManager({ onChanged }: { onChanged?: () => void }) {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // form
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [parentId, setParentId] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setCategories(await api.categories.list({}))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const activeParents = categories.filter((c) => c.is_active === 1)

  function resetForm() {
    setEditingId(null)
    setName('')
    setParentId('')
    setSortOrder('0')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên nhóm hàng.')
      return
    }
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        parent_id: parentId ? Number(parentId) : null,
        sort_order: Math.max(0, Math.floor(Number(sortOrder) || 0))
      }
      if (editingId != null) {
        await api.categories.update(editingId, input)
        toast.success('Đã cập nhật nhóm hàng.')
      } else {
        await api.categories.create(input)
        toast.success(`Đã thêm nhóm hàng "${input.name}".`)
      }
      resetForm()
      await load()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không lưu được nhóm hàng.')
    } finally {
      setSaving(false)
    }
  }

  function startEdit(c: Category) {
    setEditingId(c.id)
    setName(c.name)
    setParentId(c.parent_id != null ? String(c.parent_id) : '')
    setSortOrder(String(c.sort_order))
  }

  async function handleDeactivate() {
    const target = deleteTarget
    setDeleteTarget(null)
    if (!target) return
    try {
      await api.categories.deactivate(target.id)
      toast.success(`Đã vô hiệu hóa nhóm "${target.name}".`)
      if (editingId === target.id) resetForm()
      await load()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không vô hiệu hóa được nhóm hàng.')
    }
  }

  async function handleReactivate(c: Category) {
    try {
      await api.categories.update(c.id, { is_active: 1 })
      toast.success(`Đã bật lại nhóm "${c.name}".`)
      await load()
      onChanged?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Không bật lại được nhóm hàng.')
    }
  }

  const parentName = (id: number | null) =>
    id == null ? '—' : (categories.find((c) => c.id === id)?.name ?? `#${id}`)

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      {/* Form thêm / sửa */}
      <form
        onSubmit={handleSubmit}
        className="h-fit space-y-4 rounded-xl border bg-card p-5 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">{editingId != null ? 'Sửa nhóm hàng' : 'Thêm nhóm hàng'}</h2>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-name">Tên nhóm *</Label>
          <Input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="VD: Nước ngọt"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-parent">Nhóm cha</Label>
          <select
            id="cat-parent"
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">— Nhóm gốc —</option>
            {activeParents
              .filter((c) => c.id !== editingId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id != null ? '↳ ' : ''}
                  {c.name}
                </option>
              ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-sort">Thứ tự sắp xếp</Label>
          <Input
            id="cat-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            <Plus className="mr-1 h-4 w-4" />
            {editingId != null ? 'Lưu thay đổi' : 'Thêm nhóm'}
          </Button>
          {editingId != null && (
            <Button type="button" variant="outline" onClick={resetForm}>
              Bỏ sửa
            </Button>
          )}
        </div>
      </form>

      {/* Danh sách nhóm */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            Chưa có nhóm hàng nào. Thêm nhóm đầu tiên để phân loại sản phẩm.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nhóm hàng</TableHead>
                <TableHead>Nhóm cha</TableHead>
                <TableHead className="text-right">Thứ tự</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id} className={c.is_active === 0 ? 'opacity-60' : undefined}>
                  <TableCell className="font-medium">
                    {c.parent_id != null && <span className="mr-1 text-muted-foreground">↳</span>}
                    {c.name}
                    {c.is_active === 0 && (
                      <Badge variant="secondary" className="ml-2">
                        Đã ẩn
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{parentName(c.parent_id)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{c.sort_order}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => startEdit(c)}
                        aria-label={`Sửa nhóm ${c.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {c.is_active === 0 ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-700 hover:text-emerald-800"
                          onClick={() => handleReactivate(c)}
                          aria-label={`Bật lại nhóm ${c.name}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(c)}
                          aria-label={`Vô hiệu hóa nhóm ${c.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vô hiệu hóa nhóm "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Nhóm sẽ bị ẩn khỏi danh sách chọn. Sản phẩm thuộc nhóm vẫn giữ nguyên dữ liệu. Không
              thể vô hiệu hóa nếu nhóm còn nhóm con đang hoạt động.
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
    </div>
  )
}
