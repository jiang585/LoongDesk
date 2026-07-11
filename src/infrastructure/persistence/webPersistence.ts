import {
  DEFAULT_SETTINGS,
  type AppBackup,
  type AppSettings,
  type ChatMessage,
  type ChatSession,
  type Concern,
  type ContentSource,
  type NewsItem,
  type Todo,
} from '../../domain/models'
import type { Persistence } from '../../domain/ports'

const STORAGE_KEY = 'yuan.local.v1'

type State = Omit<AppBackup, 'version' | 'exportedAt'>

const emptyState = (): State => ({
  todos: [],
  concerns: [],
  sources: [],
  news: [],
  sessions: [],
  messages: [],
  settings: DEFAULT_SETTINGS,
})

export class WebPersistence implements Persistence {
  private state = emptyState()

  async init() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return
    try {
      const parsed = JSON.parse(saved) as Partial<State>
      this.state = {
        ...emptyState(),
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
      }
    } catch {
      this.state = emptyState()
    }
  }

  private flush() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state))
  }

  private upsert<T extends { id: string }>(collection: T[], item: T) {
    const index = collection.findIndex((entry) => entry.id === item.id)
    if (index >= 0) collection[index] = item
    else collection.unshift(item)
    this.flush()
  }

  async listTodos() { return structuredClone(this.state.todos) }
  async saveTodo(todo: Todo) { this.upsert(this.state.todos, todo) }
  async deleteTodo(id: string) {
    this.state.todos = this.state.todos.filter((item) => item.id !== id)
    this.flush()
  }

  async listConcerns() { return structuredClone(this.state.concerns) }
  async insertConcernIfAbsent(concern: Concern) {
    const existing = this.state.concerns.find((item) => item.contentHash === concern.contentHash) ?? null
    if (existing) return { inserted: false, existing: structuredClone(existing) }
    this.upsert(this.state.concerns, concern)
    return { inserted: true, existing: null }
  }
  async saveConcern(concern: Concern) { this.upsert(this.state.concerns, concern) }
  async deleteConcern(id: string) {
    this.state.concerns = this.state.concerns.filter((item) => item.id !== id)
    this.flush()
  }

  async listSources() { return structuredClone(this.state.sources) }
  async saveSource(source: ContentSource) { this.upsert(this.state.sources, source) }
  async deleteSource(id: string) {
    this.state.sources = this.state.sources.filter((item) => item.id !== id)
    this.state.news = this.state.news.filter((item) => item.sourceId !== id)
    this.flush()
  }
  async listNews() { return structuredClone(this.state.news) }
  async saveNews(items: NewsItem[]) {
    for (const item of items) this.upsert(this.state.news, item)
  }
  async clearNewsBefore(isoDate: string) {
    this.state.news = this.state.news.filter((item) => item.fetchedAt >= isoDate)
    this.flush()
  }

  async listSessions() { return structuredClone(this.state.sessions) }
  async saveSession(session: ChatSession) { this.upsert(this.state.sessions, session) }
  async listMessages(sessionId?: string) {
    const values = sessionId
      ? this.state.messages.filter((message) => message.sessionId === sessionId)
      : this.state.messages
    return structuredClone(values)
  }
  async saveMessage(message: ChatMessage) { this.upsert(this.state.messages, message) }

  async getSettings() { return structuredClone(this.state.settings) }
  async saveSettings(settings: AppSettings) {
    this.state.settings = settings
    this.flush()
  }

  async exportBackup(): Promise<AppBackup> {
    return { version: 1, exportedAt: new Date().toISOString(), ...structuredClone(this.state) }
  }

  async importBackup(backup: AppBackup) {
    const seenHashes = new Set<string>()
    this.state = {
      todos: backup.todos,
      concerns: backup.concerns.filter((concern) => {
        if (seenHashes.has(concern.contentHash)) return false
        seenHashes.add(concern.contentHash)
        return true
      }),
      sources: backup.sources,
      news: backup.news,
      sessions: backup.sessions,
      messages: backup.messages,
      settings: { ...DEFAULT_SETTINGS, ...backup.settings },
    }
    this.flush()
  }

  async clearAll() {
    this.state = emptyState()
    this.flush()
  }
}
