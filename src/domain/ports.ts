import type {
  AiProposal,
  AppBackup,
  AppSettings,
  ChatMessage,
  ChatSession,
  Concern,
  ContentSource,
  NewsItem,
  Todo,
} from './models'

export interface TodoRepository {
  listTodos(): Promise<Todo[]>
  saveTodo(todo: Todo): Promise<void>
  deleteTodo(id: string): Promise<void>
}

export interface ConcernRepository {
  listConcerns(): Promise<Concern[]>
  insertConcernIfAbsent(concern: Concern): Promise<{ inserted: boolean; existing: Concern | null }>
  saveConcern(concern: Concern): Promise<void>
  deleteConcern(id: string): Promise<void>
}

export interface NewsRepository {
  listSources(): Promise<ContentSource[]>
  saveSource(source: ContentSource): Promise<void>
  deleteSource(id: string): Promise<void>
  listNews(): Promise<NewsItem[]>
  saveNews(items: NewsItem[]): Promise<void>
  clearNewsBefore(isoDate: string): Promise<void>
}

export interface ChatRepository {
  listSessions(): Promise<ChatSession[]>
  saveSession(session: ChatSession): Promise<void>
  listMessages(sessionId?: string): Promise<ChatMessage[]>
  saveMessage(message: ChatMessage): Promise<void>
}

export interface SettingsRepository {
  getSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
}

export interface BackupRepository {
  exportBackup(): Promise<AppBackup>
  importBackup(backup: AppBackup): Promise<void>
  clearAll(): Promise<void>
}

export interface Persistence
  extends TodoRepository,
    ConcernRepository,
    NewsRepository,
    ChatRepository,
    SettingsRepository,
    BackupRepository {
  init(): Promise<void>
}

export interface FeedResult {
  title: string
  items: Array<{
    externalId: string
    title: string
    summary: string
    url: string
    publishedAt: string | null
  }>
}

export interface WebSnapshot {
  title: string
  summary: string
  url: string
}

export interface ContentProvider {
  fetchFeed(url: string): Promise<FeedResult>
  fetchWebSnapshot(url: string): Promise<WebSnapshot>
}

export interface AssistantRequest {
  requestId: string
  apiKey: string
  model: AppSettings['model']
  thinkingEnabled: boolean
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
}

export interface AssistantProvider {
  chat(request: AssistantRequest, onChunk: (chunk: string) => void): Promise<void>
  cancel(requestId: string): Promise<void>
  organize(request: AssistantRequest): Promise<AiProposal>
}

export interface SecretStore {
  unlock(password: string): Promise<boolean>
  saveApiKey(password: string, apiKey: string): Promise<void>
  getApiKey(): Promise<string | null>
  lock(): Promise<void>
}

export interface Clock {
  now(): Date
}
