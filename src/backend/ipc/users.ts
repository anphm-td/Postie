import { ipcMain } from 'electron'
import * as usersRepo from '../db/repositories/users.js'

export function registerUsersIpc(): void {
  ipcMain.handle('users:login', (_e, username: string, password: string) =>
    usersRepo.login(username, password)
  )
  ipcMain.handle('users:list', () => usersRepo.listAll())
  ipcMain.handle('users:getById', (_e, id: number) => usersRepo.getById(id))
}
