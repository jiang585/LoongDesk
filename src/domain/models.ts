export type TodoStatus = 'pending' | 'done' | 'snoozed' | 'archived'
export type TodoPriority = 'low' | 'medium' | 'high'

export interface Todo {
  id: string
  title: string
  details: string
  status: TodoStatus
  priority: TodoPriority
  dueAt: string | null
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type ConcernSourceType = 'manual' | 'paste' | 'drop' | 'file' | 'url'

export interface Concern {
  id: string
  title: string
  rawText: string
  summary: string
  sourceType: ConcernSourceType
  sourceUrl: string | null
  tags: string[]
  status: 'active' | 'archived'
  contentHash: string
  createdAt: string
  updatedAt: string
  lastCheckedAt: string | null
}

export interface ContentSource {
  id: string
  name: string
  kind: 'rss' | 'atom' | 'webpage'
  url: string
  enabled: boolean
  lastFetchedAt: string | null
  lastError: string | null
  createdAt: string
}

export interface NewsItem {
  id: string
  sourceId: string
  externalId: string
  title: string
  summary: string
  url: string
  publishedAt: string | null
  fetchedAt: string
  matchedConcernIds: string[]
}

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatRole
  content: string
  createdAt: string
}

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ConcernUpdateProposal {
  id: string
  title?: string
  summary?: string
  tags?: string[]
}

export interface TodoSuggestion {
  title: string
  details?: string
  priority?: TodoPriority
}

export interface AiProposal {
  overview: string
  concernUpdates: ConcernUpdateProposal[]
  todoSuggestions: TodoSuggestion[]
}

export interface AppSettings {
  model: 'deepseek-v4-flash' | 'deepseek-v4-pro'
  thinkingEnabled: boolean
  onboardingComplete: boolean
  vaultConfigured: boolean
  refreshIntervalMinutes: number
  cacheRetentionDays: number
  /** Desktop accessibility scale. Stored locally and shared by all windows. */
  fontScale: 1 | 1.12 | 1.25
  petEnabled: boolean
  petAlwaysOnTop: boolean
  petBounds: { x: number; y: number } | null
}

export interface AppBackup {
  version: 1
  exportedAt: string
  todos: Todo[]
  concerns: Concern[]
  sources: ContentSource[]
  news: NewsItem[]
  sessions: ChatSession[]
  messages: ChatMessage[]
  settings: AppSettings
}

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'deepseek-v4-flash',
  thinkingEnabled: false,
  onboardingComplete: false,
  vaultConfigured: false,
  refreshIntervalMinutes: 30,
  cacheRetentionDays: 30,
  fontScale: 1,
  petEnabled: true,
  petAlwaysOnTop: true,
  petBounds: null,
}
