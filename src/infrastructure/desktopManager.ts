import { invoke } from '@tauri-apps/api/core'
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { isTauri } from './platform'

export interface DesktopPreferences {
  backgroundResident: boolean
  shortcutsEnabled: boolean
}

export interface DesktopManager {
  preferences(): Promise<DesktopPreferences>
  setBackgroundResident(enabled: boolean): Promise<void>
  setShortcutsEnabled(enabled: boolean): Promise<void>
  checkForUpdate(): Promise<Update | null>
  installUpdate(update: Update, onProgress?: (event: DownloadEvent) => void): Promise<void>
}

const WEB_DEFAULTS: DesktopPreferences = { backgroundResident: false, shortcutsEnabled: false }

export const desktopManager: DesktopManager = {
  async preferences() {
    return isTauri() ? invoke<DesktopPreferences>('desktop_preferences') : WEB_DEFAULTS
  },
  async setBackgroundResident(enabled) {
    if (isTauri()) await invoke('set_background_resident', { enabled })
  },
  async setShortcutsEnabled(enabled) {
    if (isTauri()) await invoke('set_shortcuts_enabled', { enabled })
  },
  async checkForUpdate() {
    return isTauri() ? check() : null
  },
  async installUpdate(update, onProgress) {
    if (!isTauri()) return
    await update.downloadAndInstall(onProgress)
    await relaunch()
  },
}
