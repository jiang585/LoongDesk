import { appDataDir, join } from '@tauri-apps/api/path'
import { Stronghold, type Client } from '@tauri-apps/plugin-stronghold'
import type { SecretStore } from '../domain/ports'
import { isTauri } from './platform'

const CLIENT_NAME = 'yuan-secrets'
const API_KEY_NAME = 'deepseek-api-key'

export class LocalSecretStore implements SecretStore {
  private stronghold: Stronghold | null = null
  private client: Client | null = null
  private webKey: string | null = null

  async unlock(password: string) {
    if (!password) return false
    if (!isTauri()) {
      this.webKey = sessionStorage.getItem('yuan.preview.deepseek')
      return true
    }
    try {
      const path = await join(await appDataDir(), 'yuan-vault.hold')
      this.stronghold = await Stronghold.load(path, password)
      try {
        this.client = await this.stronghold.loadClient(CLIENT_NAME)
      } catch {
        this.client = await this.stronghold.createClient(CLIENT_NAME)
        await this.stronghold.save()
      }
      return true
    } catch {
      this.stronghold = null
      this.client = null
      return false
    }
  }

  async saveApiKey(password: string, apiKey: string) {
    if (!apiKey.trim()) throw new Error('API Key 不能为空')
    if (!isTauri()) {
      this.webKey = apiKey.trim()
      sessionStorage.setItem('yuan.preview.deepseek', this.webKey)
      return
    }
    if (!this.client && !(await this.unlock(password))) throw new Error('保险库密码不正确')
    await this.client!.getStore().insert(API_KEY_NAME, Array.from(new TextEncoder().encode(apiKey.trim())))
    await this.stronghold!.save()
  }

  async getApiKey() {
    if (!isTauri()) return this.webKey
    if (!this.client) return null
    const bytes = await this.client.getStore().get(API_KEY_NAME)
    return bytes ? new TextDecoder().decode(new Uint8Array(bytes)) : null
  }

  async lock() {
    this.webKey = null
    this.client = null
    if (this.stronghold) await this.stronghold.unload()
    this.stronghold = null
  }
}

