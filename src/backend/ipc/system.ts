import { ipcMain } from 'electron'
import { getDb, needsFirstRunSetup, initializeDatabase } from '../db/connection.js'

export function registerSystemIpc(): void {
  ipcMain.handle('db:needsSetup', () => needsFirstRunSetup())
  ipcMain.handle('db:initialize', (_e, adminPassword: string) => {
    initializeDatabase(adminPassword)
    return true
  })
  ipcMain.handle('db:isReady', () => {
    try {
      getDb()
      return true
    } catch {
      return false
    }
  })
}
