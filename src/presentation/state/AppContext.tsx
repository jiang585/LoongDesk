/* oxlint-disable react/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  DEFAULT_SETTINGS,
  type AiProposal,
  type AppBackup,
  type AppSettings,
  type ChatMessage,
  type ChatSession,
  type Concern,
  type ConcernSourceType,
  type ContentSource,
  type NewsItem,
  type Todo,
} from '../../domain/models'
import type { Persistence } from '../../domain/ports'
import { hashText, matchConcernIds, newId, nowIso } from '../../application/services'
import { DeepSeekAssistantProvider } from '../../infrastructure/assistantProvider'
import { TauriContentProvider } from '../../infrastructure/contentProvider'
import { getPersistence } from '../../infrastructure/persistence'
import { LocalSecretStore } from '../../infrastructure/secretStore'

export const DEFAULT_SOURCES: Array<Pick<ContentSource, 'name' | 'kind' | 'url'>> = [
  { name: '中新网·即时新闻', kind: 'rss', url: 'https://www.chinanews.com.cn/rss/scroll-news.xml' },
  { name: '中新网·财经', kind: 'rss', url: 'https://www.chinanews.com.cn/rss/finance.xml' },
  { name: '中新网·国际', kind: 'rss', url: 'https://www.chinanews.com.cn/rss/world.xml' },
]

interface CaptureResult { concern: Concern; duplicate: Concern | null }

interface AppContextValue {
  loading: boolean
  error: string | null
  notice: string | null
  todos: Todo[]
  concerns: Concern[]
  sources: ContentSource[]
  news: NewsItem[]
  sessions: ChatSession[]
  messages: ChatMessage[]
  settings: AppSettings
  secretStore: LocalSecretStore
  assistant: DeepSeekAssistantProvider
  createTodo(input: Partial<Todo> & Pick<Todo, 'title'>): Promise<Todo>
  updateTodo(todo: Todo): Promise<void>
  deleteTodo(id: string): Promise<void>
  captureConcern(text: string, sourceType: ConcernSourceType, sourceUrl?: string | null): Promise<CaptureResult>
  updateConcern(concern: Concern): Promise<void>
  deleteConcern(id: string): Promise<void>
  saveSource(source: ContentSource): Promise<void>
  addDefaultSources(): Promise<void>
  deleteSource(id: string): Promise<void>
  refreshNews(sourceId?: string): Promise<void>
  saveSettings(settings: AppSettings): Promise<void>
  completeOnboarding(addSources: boolean): Promise<void>
  saveMessage(message: ChatMessage): Promise<void>
  applyProposal(proposal: AiProposal): Promise<void>
  exportBackup(): Promise<AppBackup>
  importBackup(backup: AppBackup): Promise<void>
  clearAllData(): Promise<void>
  setNotice(message: string | null): void
}

const AppContext = createContext<AppContextValue | null>(null)
const content = new TauriContentProvider()
const assistant = new DeepSeekAssistantProvider()
const secretStore = new LocalSecretStore()

export function AppProvider({ children }: { children: ReactNode }) {
  const persistenceRef = useRef<Persistence | null>(null)
  const refreshLock = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [todos, setTodos] = useState<Todo[]>([])
  const [concerns, setConcerns] = useState<Concern[]>([])
  const [sources, setSources] = useState<ContentSource[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)

  const reload = useCallback(async (persistence = persistenceRef.current) => {
    if (!persistence) return
    const [nextTodos, nextConcerns, nextSources, nextNews, nextSessions, nextMessages, nextSettings] = await Promise.all([
      persistence.listTodos(), persistence.listConcerns(), persistence.listSources(),
      persistence.listNews(), persistence.listSessions(), persistence.listMessages(),
      persistence.getSettings(),
    ])
    setTodos(nextTodos)
    setConcerns(nextConcerns)
    setSources(nextSources)
    setNews(nextNews)
    setSessions(nextSessions)
    setMessages(nextMessages)
    setSettings(nextSettings)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const persistence = await getPersistence()
        persistenceRef.current = persistence
        await reload(persistence)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '本地数据库初始化失败')
      } finally {
        setLoading(false)
      }
    })()
  }, [reload])

  const createTodo = useCallback(async (input: Partial<Todo> & Pick<Todo, 'title'>) => {
    const now = nowIso()
    const todo: Todo = {
      id: input.id ?? newId(), title: input.title.trim(), details: input.details ?? '',
      status: input.status ?? 'pending', priority: input.priority ?? 'medium',
      dueAt: input.dueAt ?? null, tags: input.tags ?? [], createdAt: input.createdAt ?? now,
      updatedAt: now,
    }
    await persistenceRef.current!.saveTodo(todo)
    setTodos((values) => [todo, ...values.filter((item) => item.id !== todo.id)])
    return todo
  }, [])

  const updateTodo = useCallback(async (todo: Todo) => {
    const next = { ...todo, updatedAt: nowIso() }
    await persistenceRef.current!.saveTodo(next)
    setTodos((values) => values.map((item) => item.id === next.id ? next : item))
  }, [])

  const deleteTodo = useCallback(async (id: string) => {
    await persistenceRef.current!.deleteTodo(id)
    setTodos((values) => values.filter((item) => item.id !== id))
  }, [])

  const captureConcern = useCallback(async (
    text: string,
    sourceType: ConcernSourceType,
    sourceUrl: string | null = null,
  ): Promise<CaptureResult> => {
    const rawText = text.trim()
    if (!rawText) throw new Error('呈上的内容不能为空')
    const contentHash = await hashText(rawText)
    const duplicate = concerns.find((item) => item.contentHash === contentHash) ?? null
    const now = nowIso()
    let title = rawText.split(/\r?\n/)[0].slice(0, 56)
    let summary = rawText.replace(/\s+/g, ' ').slice(0, 180)
    let finalUrl = sourceUrl
    if (/^https:\/\//i.test(rawText) && rawText.length < 2048) {
      const snapshot = await content.fetchWebSnapshot(rawText)
      title = snapshot.title || new URL(rawText).hostname
      summary = snapshot.summary
      finalUrl = snapshot.url
      sourceType = 'url'
    }
    const concern: Concern = {
      id: newId(), title, rawText, summary, sourceType, sourceUrl: finalUrl,
      tags: [], status: 'active', contentHash, createdAt: now, updatedAt: now,
      lastCheckedAt: sourceType === 'url' ? now : null,
    }
    if (!duplicate) {
      await persistenceRef.current!.saveConcern(concern)
      setConcerns((values) => [concern, ...values])
    }
    return { concern, duplicate }
  }, [concerns])

  const updateConcern = useCallback(async (concern: Concern) => {
    const next = { ...concern, updatedAt: nowIso() }
    await persistenceRef.current!.saveConcern(next)
    setConcerns((values) => values.map((item) => item.id === next.id ? next : item))
  }, [])

  const deleteConcern = useCallback(async (id: string) => {
    await persistenceRef.current!.deleteConcern(id)
    setConcerns((values) => values.filter((item) => item.id !== id))
  }, [])

  const saveSource = useCallback(async (source: ContentSource) => {
    await persistenceRef.current!.saveSource(source)
    setSources((values) => [source, ...values.filter((item) => item.id !== source.id)])
  }, [])

  const addDefaultSources = useCallback(async () => {
    for (const value of DEFAULT_SOURCES) {
      if (sources.some((source) => source.url === value.url)) continue
      await saveSource({ ...value, id: newId(), enabled: true, lastFetchedAt: null, lastError: null, createdAt: nowIso() })
    }
  }, [saveSource, sources])

  const deleteSource = useCallback(async (id: string) => {
    await persistenceRef.current!.deleteSource(id)
    setSources((values) => values.filter((item) => item.id !== id))
    setNews((values) => values.filter((item) => item.sourceId !== id))
  }, [])

  const refreshNews = useCallback(async (sourceId?: string) => {
    if (refreshLock.current) return
    refreshLock.current = true
    const targets = sources.filter((source) => source.enabled && (!sourceId || source.id === sourceId))
    if (!targets.length) {
      setNotice('尚未启用任何奏报来源')
      refreshLock.current = false
      return
    }
    try {
      let succeeded = 0
      let failed = 0
      for (const source of targets) {
        try {
          const result = await content.fetchFeed(source.url)
          const fetchedAt = nowIso()
          const items: NewsItem[] = []
          for (const value of result.items) {
            const externalId = value.externalId || value.url || value.title
            items.push({
              id: `${source.id}-${(await hashText(externalId)).slice(0, 20)}`,
              sourceId: source.id, externalId, title: value.title, summary: value.summary,
              url: value.url, publishedAt: value.publishedAt, fetchedAt,
              matchedConcernIds: matchConcernIds(value, concerns.filter((item) => item.status === 'active')),
            })
          }
          await persistenceRef.current!.saveNews(items)
          await persistenceRef.current!.saveSource({ ...source, name: source.name || result.title, lastFetchedAt: fetchedAt, lastError: null })
          succeeded += 1
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : '刷新失败'
          await persistenceRef.current!.saveSource({ ...source, lastError: message })
          failed += 1
        }
      }
      const cutoff = new Date(Date.now() - settings.cacheRetentionDays * 86_400_000).toISOString()
      await persistenceRef.current!.clearNewsBefore(cutoff)
      await reload()
      setNotice(
        failed === 0
          ? '今日奏报已更新'
          : succeeded > 0
            ? `已更新 ${succeeded} 条来源，${failed} 条暂不可用`
            : '来源暂不可用，继续展示本地缓存',
      )
    } finally {
      refreshLock.current = false
    }
  }, [concerns, reload, settings.cacheRetentionDays, sources])

  useEffect(() => {
    if (loading || !settings.onboardingComplete || !sources.some((source) => source.enabled)) return
    const latest = sources.reduce((time, source) => Math.max(time, source.lastFetchedAt ? Date.parse(source.lastFetchedAt) : 0), 0)
    if (Date.now() - latest > settings.refreshIntervalMinutes * 60_000) void refreshNews()
    const timer = window.setInterval(() => void refreshNews(), settings.refreshIntervalMinutes * 60_000)
    return () => window.clearInterval(timer)
  }, [loading, refreshNews, settings.onboardingComplete, settings.refreshIntervalMinutes, sources])

  const saveSettings = useCallback(async (next: AppSettings) => {
    await persistenceRef.current!.saveSettings(next)
    setSettings(next)
  }, [])

  const completeOnboarding = useCallback(async (shouldAddSources: boolean) => {
    if (shouldAddSources) await addDefaultSources()
    await saveSettings({ ...settings, onboardingComplete: true })
  }, [addDefaultSources, saveSettings, settings])

  const saveMessage = useCallback(async (message: ChatMessage) => {
    let session = sessions[0]
    if (!session) {
      session = { id: message.sessionId, title: '御前问答', createdAt: message.createdAt, updatedAt: message.createdAt }
      await persistenceRef.current!.saveSession(session)
      setSessions([session])
    } else {
      session = { ...session, updatedAt: message.createdAt }
      await persistenceRef.current!.saveSession(session)
      setSessions((values) => values.map((item) => item.id === session.id ? session : item))
    }
    await persistenceRef.current!.saveMessage(message)
    setMessages((values) => [...values.filter((item) => item.id !== message.id), message])
  }, [sessions])

  const applyProposal = useCallback(async (proposal: AiProposal) => {
    for (const update of proposal.concernUpdates) {
      const current = concerns.find((item) => item.id === update.id)
      if (!current) continue
      await updateConcern({ ...current, ...update, tags: update.tags ?? current.tags })
    }
    for (const todo of proposal.todoSuggestions) {
      await createTodo({ title: todo.title, details: todo.details ?? '', priority: todo.priority ?? 'medium' })
    }
    setNotice('朱批已落，整理结果已写入本地')
  }, [concerns, createTodo, updateConcern])

  const exportBackup = useCallback(() => persistenceRef.current!.exportBackup(), [])
  const importBackup = useCallback(async (backup: AppBackup) => {
    await persistenceRef.current!.importBackup(backup)
    await reload()
  }, [reload])
  const clearAllData = useCallback(async () => {
    await persistenceRef.current!.clearAll()
    await secretStore.lock()
    await reload()
  }, [reload])

  const value = useMemo<AppContextValue>(() => ({
    loading, error, notice, todos, concerns, sources, news, sessions, messages, settings,
    secretStore, assistant, createTodo, updateTodo, deleteTodo, captureConcern,
    updateConcern, deleteConcern, saveSource, addDefaultSources, deleteSource,
    refreshNews, saveSettings, completeOnboarding, saveMessage, applyProposal,
    exportBackup, importBackup, clearAllData, setNotice,
  }), [
    addDefaultSources, applyProposal, captureConcern, clearAllData, completeOnboarding,
    concerns, createTodo, deleteConcern, deleteSource, deleteTodo, error, exportBackup,
    importBackup, loading, messages, news, notice, refreshNews, saveMessage, saveSettings,
    saveSource, sessions, settings, sources, todos, updateConcern, updateTodo,
  ])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside AppProvider')
  return value
}
