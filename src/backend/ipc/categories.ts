import { ipcMain } from 'electron'
import * as categoriesRepo from '../db/repositories/categories.js'
import type {
  CreateCategoryInput,
  ListCategoriesOptions,
  UpdateCategoryInput
} from '../db/repositories/categories.js'

export function registerCategoriesIpc(): void {
  ipcMain.handle('categories:list', (_e, opts: ListCategoriesOptions = {}) =>
    categoriesRepo.list(opts)
  )
  ipcMain.handle('categories:getById', (_e, id: number) =>
    categoriesRepo.getById(id)
  )
  ipcMain.handle('categories:create', (_e, input: CreateCategoryInput) =>
    categoriesRepo.create(input)
  )
  ipcMain.handle('categories:update', (_e, id: number, input: UpdateCategoryInput) =>
    categoriesRepo.update(id, input)
  )
  ipcMain.handle('categories:deactivate', (_e, id: number) =>
    categoriesRepo.deactivate(id)
  )
}
