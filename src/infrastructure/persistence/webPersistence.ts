import {
  DEFAULT_SETTINGS,
  type AppBackup,
  type AppSettings,
  type AiProposalHistory,
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
  proposalHistory: [],
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
  async deleteSession(id: string) {
    this.state.sessions = this.state.sessions.filter((item) => item.id !== id)
    this.state.messages = this.state.messages.filter((item) => item.sessionId !== id)
    this.flush()
  }
  async listMessages(sessionId?: string) {
    const values = sessionId
      ? this.state.messages.filter((message) => message.sessionId === sessionId)
      : this.state.messages
    return structuredClone(values)
  }
  async saveMessage(message: ChatMessage) { this.upsert(this.state.messages, message) }

  async listProposalHistory() { return structuredClone(this.state.proposalHistory) }
  async applyProposalTransaction(history: AiProposalHistory) {
    for (const change of history.concernChanges) {
      const index = this.state.concerns.findIndex((item) => item.id === change.after.id)
      if (index >= 0) this.state.concerns[index] = change.after
    }
    for (const todo of history.createdTodos) {
      const index = this.state.todos.findIndex((item) => item.id === todo.id)
      if (index >= 0) this.state.todos[index] = todo
      else this.state.todos.unshift(todo)
    }
    this.state.proposalHistory.unshift(history)
    this.flush()
  }
  async undoProposalTransaction(id: string) {
    const history = this.state.proposalHistory.find((item) => item.id === id)
    if (!history || history.undoneAt) throw new Error('这次朱批不存在或已经撤销')
    const latest = this.state.proposalHistory
      .filter((item) => !item.undoneAt)
      .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt))[0]
    if (!latest || latest.id !== id) throw new Error('只能撤销最近一次尚未撤销的朱批')
    for (const change of history.concernChanges) {
      const current = this.state.concerns.find((item) => item.id === change.after.id)
      if (!current || JSON.stringify(current) !== JSON.stringify(change.after)) {
        throw new Error(`关心项“${change.after.title}”在朱批后已被修改，已停止撤销以保护新内容`)
      }
    }
    for (const created of history.createdTodos) {
      const current = this.state.todos.find((item) => item.id === created.id)
      if (!current || JSON.stringify(current) !== JSON.stringify(created)) {
        throw new Error(`待办“${created.title}”在朱批后已被修改，已停止撤销以保护新内容`)
      }
    }
    for (const change of history.concernChanges) {
      const index = this.state.concerns.findIndex((item) => item.id === change.before.id)
      if (index >= 0) this.state.concerns[index] = change.before
    }
    const todoIds = new Set(history.createdTodos.map((item) => item.id))
    this.state.todos = this.state.todos.filter((item) => !todoIds.has(item.id))
    history.undoneAt = new Date().toISOString()
    this.flush()
    return structuredClone(history)
  }

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
      proposalHistory: backup.proposalHistory,
      settings: { ...DEFAULT_SETTINGS, ...backup.settings },
    }
    this.flush()
  }

  async clearAll() {
    this.state = emptyState()
    this.flush()
  }

  async getDatabaseDiagnostics() {
    return {
      engine: 'localStorage' as const,
      status: 'healthy' as const,
      schemaVersion: 1,
      appliedMigrations: 1,
      integrityMessage: 'ok',
      foreignKeyIssues: 0,
      checkedAt: new Date().toISOString(),
    }
  }
}
