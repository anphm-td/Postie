// ============================================================================
//  Postie POS - Categories repository (nhóm hàng hóa phân cấp)
// ----------------------------------------------------------------------------
//  categories là cây phân cấp qua parent_id (NULL = nhóm gốc) — P0.7
//  (roadmap §5, bảng categories có sẵn tại db/schema.sql:71-78).
//
//  Quy ước kiến trúc giữ nguyên:
//    * Soft-delete qua is_active — KHÔNG DELETE cứng, để giữ lịch sử
//      products.category_id (products tham chiếu bằng FK ON DELETE SET NULL
//      nhưng cú "SET NULL" chỉ chạy khi xóa cứng, điều ta không bao giờ làm).
//    * name UNIQUE COLLATE NOCASE — repo kiểm tra trùng trước để trả lỗi
//      tiếng Việt thân thiện thay vì lỗi raw SQLite.
// ============================================================================

import { prepare } from '../connection.js'
import type { Category } from '@shared/types'

// ----------------------------------------------------------------------------
// Types cục bộ (chưa có trong src/shared/types.ts — đã ghi vào missingTypes)
// ----------------------------------------------------------------------------

export interface ListCategoriesOptions {
  search?: string
  activeOnly?: boolean
}

export interface CreateCategoryInput {
  name: string
  parent_id?: number | null
  sort_order?: number
}

/** Partial update. parent_id = null đưa nhóm lên cấp gốc. */
export interface UpdateCategoryInput {
  name?: string
  parent_id?: number | null
  sort_order?: number
  is_active?: number
}

/** List nhóm hàng, sắp sẵn theo cây: nhóm cha rồi đến con của chính nó. */
export function list(opts: ListCategoriesOptions = {}): Category[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.search) {
    where.push('name LIKE ?')
    params.push(`%${opts.search}%`)
  }
  if (opts.activeOnly) where.push('is_active = 1')
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // COALESCE(parent_id, id): nhóm cha và các con của nó dùng chung một key,
  // "parent_id IS NOT NULL" đẩy cha (0) lên trước con (1) trong cùng key.
  return prepare(
    `SELECT * FROM categories ${clause}
     ORDER BY COALESCE(parent_id, id), parent_id IS NOT NULL, sort_order, name`
  ).all(...params) as Category[]
}

export function getById(id: number): Category | undefined {
  return prepare(`SELECT * FROM categories WHERE id = ?`).get(id) as Category | undefined
}

/**
 * Tạo nhóm hàng mới. Từ chối tên rỗng/trùng và nhóm cha không hợp lệ
 * (không tồn tại, đã bị vô hiệu hóa, hoặc trùng chính nó).
 */
export function create(input: CreateCategoryInput): Category {
  const name = input.name.trim()
  if (!name) throw new Error('Tên nhóm hàng không được để trống.')
  const dup = prepare(`SELECT id FROM categories WHERE name = ? COLLATE NOCASE`).get(name)
  if (dup) throw new Error(`Nhóm hàng "${name}" đã tồn tại.`)
  const parentId = input.parent_id ?? null
  assertValidParent(parentId)
  const sortOrder = input.sort_order ?? 0
  if (!Number.isInteger(sortOrder) || sortOrder < 0) {
    throw new Error('Thứ tự sắp xếp (sort_order) phải là số nguyên không âm.')
  }
  const info = prepare(
    `INSERT INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)`
  ).run(name, parentId, sortOrder)
  return getById(Number(info.lastInsertRowid)) as Category
}

/**
 * Sửa nhóm hàng. Có guard chống vòng lặp: một nhóm không thể chọn chính nó
 * hoặc một nhóm con của nó làm nhóm cha.
 */
export function update(id: number, input: UpdateCategoryInput): Category {
  const existing = getById(id)
  if (!existing) throw new Error('Không tìm thấy nhóm hàng.')

  const sets: string[] = []
  const params: Record<string, unknown> = { id }

  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) throw new Error('Tên nhóm hàng không được để trống.')
    const dup = prepare(`SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND id != ?`).get(name, id)
    if (dup) throw new Error(`Nhóm hàng "${name}" đã tồn tại.`)
    sets.push('name = @name')
    params.name = name
  }
  if (input.parent_id !== undefined) {
    // selfId = id để chặn việc nhóm tự chọn chính nó làm cha.
    assertValidParent(input.parent_id ?? null, id)
    sets.push('parent_id = @parent_id')
    params.parent_id = input.parent_id ?? null
  }
  if (input.sort_order !== undefined) {
    if (!Number.isInteger(input.sort_order) || input.sort_order < 0) {
      throw new Error('Thứ tự sắp xếp (sort_order) phải là số nguyên không âm.')
    }
    sets.push('sort_order = @sort_order')
    params.sort_order = input.sort_order
  }
  if (input.is_active !== undefined) {
    if (input.is_active !== 0 && input.is_active !== 1) throw new Error('is_active chỉ nhận 0 hoặc 1.')
    sets.push('is_active = @is_active')
    params.is_active = input.is_active
  }

  if (sets.length === 0) return existing
  prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = @id`).run(params)
  return getById(id) as Category
}

/**
 * Soft-delete (ẩn khỏi danh sách chọn). Chặn khi còn nhóm con đang hoạt động
 * để cây không bị "mồ côi" — xử lý con trước hoặc vô hiệu hóa con trước.
 */
export function deactivate(id: number): Category {
  const existing = getById(id)
  if (!existing) throw new Error('Không tìm thấy nhóm hàng.')
  const child = prepare(
    `SELECT COUNT(*) AS c FROM categories WHERE parent_id = ? AND is_active = 1`
  ).get(id) as { c: number }
  if (child.c > 0) {
    throw new Error(
      `Không thể vô hiệu hóa nhóm "${existing.name}" vì còn ${child.c} nhóm con đang hoạt động. Hãy xử lý các nhóm con trước.`
    )
  }
  prepare(`UPDATE categories SET is_active = 0 WHERE id = ?`).run(id)
  return getById(id) as Category
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/**
 * Kiểm tra nhóm cha hợp lệ: phải tồn tại, đang hoạt động, và không nằm trên
 * đường cha→con đi qua `selfId` (chặn vòng lặp khi cập nhật).
 */
function assertValidParent(parentId: number | null, selfId?: number): void {
  if (parentId == null) return
  let cursor: number | null = parentId
  const seen = new Set<number>()
  while (cursor != null) {
    if (selfId != null && cursor === selfId) {
      throw new Error('Không thể chọn chính nhóm này (hoặc một nhóm con của nó) làm nhóm cha.')
    }
    if (seen.has(cursor)) throw new Error('Cây nhóm hàng bị lặp — dữ liệu không hợp lệ.')
    seen.add(cursor)
    const row = getById(cursor)
    if (!row) throw new Error('Nhóm cha không tồn tại.')
    if (!row.is_active) throw new Error(`Nhóm cha "${row.name}" đã bị vô hiệu hóa.`)
    cursor = row.parent_id
  }
}
