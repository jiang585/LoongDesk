import Database from '@tauri-apps/plugin-sql'
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

type Row = Record<string, string | number | null>
const json = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

export class SqlitePersistence implements Persistence {
  private db!: Database

  async init() {
    this.db = await Database.load('sqlite:yuan.db')
  }

  async listTodos(): Promise<Todo[]> {
    const rows = await this.db.select<Row[]>('SELECT * FROM todos ORDER BY updated_at DESC')
    return rows.map((row) => ({
      id: String(row.id), title: String(row.title), details: String(row.details ?? ''),
      status: row.status as Todo['status'], priority: row.priority as Todo['priority'],
      dueAt: row.due_at as string | null, tags: json(String(row.tags_json ?? '[]'), []),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }))
  }
  async saveTodo(todo: Todo) {
    await this.db.execute(
      `INSERT INTO todos (id,title,details,status,priority,due_at,tags_json,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(id) DO UPDATE SET title=$2,details=$3,status=$4,priority=$5,due_at=$6,tags_json=$7,updated_at=$9`,
      [todo.id, todo.title, todo.details, todo.status, todo.priority, todo.dueAt,
        JSON.stringify(todo.tags), todo.createdAt, todo.updatedAt],
    )
  }
  async deleteTodo(id: string) { await this.db.execute('DELETE FROM todos WHERE id=$1', [id]) }

  async listConcerns(): Promise<Concern[]> {
    const rows = await this.db.select<Row[]>('SELECT * FROM concerns ORDER BY updated_at DESC')
    return rows.map((row) => ({
      id: String(row.id), title: String(row.title), rawText: String(row.raw_text),
      summary: String(row.summary ?? ''), sourceType: row.source_type as Concern['sourceType'],
      sourceUrl: row.source_url as string | null, tags: json(String(row.tags_json ?? '[]'), []),
      status: row.status as Concern['status'], contentHash: String(row.content_hash),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
      lastCheckedAt: row.last_checked_at as string | null,
    }))
  }
  async saveConcern(concern: Concern) {
    await this.db.execute(
      `INSERT INTO concerns (id,title,raw_text,summary,source_type,source_url,tags_json,status,content_hash,created_at,updated_at,last_checked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(id) DO UPDATE SET title=$2,raw_text=$3,summary=$4,source_type=$5,source_url=$6,tags_json=$7,status=$8,content_hash=$9,updated_at=$11,last_checked_at=$12`,
      [concern.id, concern.title, concern.rawText, concern.summary, concern.sourceType,
        concern.sourceUrl, JSON.stringify(concern.tags), concern.status, concern.contentHash,
        concern.createdAt, concern.updatedAt, concern.lastCheckedAt],
    )
  }
  async deleteConcern(id: string) { await this.db.execute('DELETE FROM concerns WHERE id=$1', [id]) }

  async listSources(): Promise<ContentSource[]> {
    const rows = await this.db.select<Row[]>('SELECT * FROM content_sources ORDER BY created_at')
    return rows.map((row) => ({
      id: String(row.id), name: String(row.name), kind: row.kind as ContentSource['kind'],
      url: String(row.url), enabled: Boolean(row.enabled), lastFetchedAt: row.last_fetched_at as string | null,
      lastError: row.last_error as string | null, createdAt: String(row.created_at),
    }))
  }
  async saveSource(source: ContentSource) {
    await this.db.execute(
      `INSERT INTO content_sources (id,name,kind,url,enabled,last_fetched_at,last_error,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(id) DO UPDATE SET name=$2,kind=$3,url=$4,enabled=$5,last_fetched_at=$6,last_error=$7`,
      [source.id, source.name, source.kind, source.url, source.enabled ? 1 : 0,
        source.lastFetchedAt, source.lastError, source.createdAt],
    )
  }
  async deleteSource(id: string) {
    await this.db.execute('DELETE FROM news_items WHERE source_id=$1', [id])
    await this.db.execute('DELETE FROM content_sources WHERE id=$1', [id])
  }
  async listNews(): Promise<NewsItem[]> {
    const rows = await this.db.select<Row[]>('SELECT * FROM news_items ORDER BY COALESCE(published_at,fetched_at) DESC')
    return rows.map((row) => ({
      id: String(row.id), sourceId: String(row.source_id), externalId: String(row.external_id),
      title: String(row.title), summary: String(row.summary ?? ''), url: String(row.url),
      publishedAt: row.published_at as string | null, fetchedAt: String(row.fetched_at),
      matchedConcernIds: json(String(row.matched_concern_ids_json ?? '[]'), []),
    }))
  }
  async saveNews(items: NewsItem[]) {
    for (const item of items) {
      await this.db.execute(
        `INSERT INTO news_items (id,source_id,external_id,title,summary,url,published_at,fetched_at,matched_concern_ids_json)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT(source_id,external_id) DO UPDATE SET title=$4,summary=$5,url=$6,published_at=$7,fetched_at=$8,matched_concern_ids_json=$9`,
        [item.id, item.sourceId, item.externalId, item.title, item.summary, item.url,
          item.publishedAt, item.fetchedAt, JSON.stringify(item.matchedConcernIds)],
      )
    }
  }
  async clearNewsBefore(isoDate: string) { await this.db.execute('DELETE FROM news_items WHERE fetched_at < $1', [isoDate]) }

  async listSessions(): Promise<ChatSession[]> {
    return this.db.select<ChatSession[]>('SELECT id,title,created_at as createdAt,updated_at as updatedAt FROM chat_sessions ORDER BY updated_at DESC')
  }
  async saveSession(session: ChatSession) {
    await this.db.execute(
      `INSERT INTO chat_sessions (id,title,created_at,updated_at) VALUES ($1,$2,$3,$4)
       ON CONFLICT(id) DO UPDATE SET title=$2,updated_at=$4`,
      [session.id, session.title, session.createdAt, session.updatedAt],
    )
  }
  async listMessages(sessionId?: string): Promise<ChatMessage[]> {
    const query = `SELECT id,session_id as sessionId,role,content,created_at as createdAt FROM chat_messages ${sessionId ? 'WHERE session_id=$1' : ''} ORDER BY created_at`
    return this.db.select<ChatMessage[]>(query, sessionId ? [sessionId] : [])
  }
  async saveMessage(message: ChatMessage) {
    await this.db.execute(
      'INSERT OR REPLACE INTO chat_messages (id,session_id,role,content,created_at) VALUES ($1,$2,$3,$4,$5)',
      [message.id, message.sessionId, message.role, message.content, message.createdAt],
    )
  }

  async getSettings(): Promise<AppSettings> {
    const rows = await this.db.select<Array<{ value_json: string }>>('SELECT value_json FROM app_settings WHERE key=$1', ['app'])
    return rows[0] ? { ...DEFAULT_SETTINGS, ...json(rows[0].value_json, {}) } : DEFAULT_SETTINGS
  }
  async saveSettings(settings: AppSettings) {
    await this.db.execute('INSERT OR REPLACE INTO app_settings (key,value_json) VALUES ($1,$2)', ['app', JSON.stringify(settings)])
  }

  async exportBackup(): Promise<AppBackup> {
    const [todos, concerns, sources, news, sessions, messages, settings] = await Promise.all([
      this.listTodos(), this.listConcerns(), this.listSources(), this.listNews(),
      this.listSessions(), this.listMessages(), this.getSettings(),
    ])
    return { version: 1, exportedAt: new Date().toISOString(), todos, concerns, sources, news, sessions, messages, settings }
  }

  async importBackup(backup: AppBackup) {
    await this.db.execute('BEGIN')
    try {
      await this.clearAll(false)
      for (const value of backup.todos) await this.saveTodo(value)
      for (const value of backup.concerns) await this.saveConcern(value)
      for (const value of backup.sources) await this.saveSource(value)
      await this.saveNews(backup.news)
      for (const value of backup.sessions) await this.saveSession(value)
      for (const value of backup.messages) await this.saveMessage(value)
      await this.saveSettings(backup.settings)
      await this.db.execute('COMMIT')
    } catch (error) {
      await this.db.execute('ROLLBACK')
      throw error
    }
  }

  async clearAll(withTransaction = true) {
    if (withTransaction) await this.db.execute('BEGIN')
    try {
      for (const table of ['chat_messages','chat_sessions','news_items','content_sources','concerns','todos','app_settings']) {
        await this.db.execute(`DELETE FROM ${table}`)
      }
      if (withTransaction) await this.db.execute('COMMIT')
    } catch (error) {
      if (withTransaction) await this.db.execute('ROLLBACK')
      throw error
    }
  }
}

