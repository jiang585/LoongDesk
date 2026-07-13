import Database from '@tauri-apps/plugin-sql'
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
  type DatabaseDiagnostics,
} from '../../domain/models'
import type { Persistence } from '../../domain/ports'

type Row = Record<string, string | number | null>
const json = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
}

const concernFromRow = (row: Row): Concern => ({
  id: String(row.id), title: String(row.title), rawText: String(row.raw_text),
  summary: String(row.summary ?? ''), sourceType: row.source_type as Concern['sourceType'],
  sourceUrl: row.source_url as string | null, tags: json(String(row.tags_json ?? '[]'), []),
  status: row.status as Concern['status'], contentHash: String(row.content_hash),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  lastCheckedAt: row.last_checked_at as string | null,
})
const todoFromRow = (row: Row): Todo => ({
  id: String(row.id), title: String(row.title), details: String(row.details ?? ''),
  status: row.status as Todo['status'], priority: row.priority as Todo['priority'],
  dueAt: row.due_at as string | null, tags: json(String(row.tags_json ?? '[]'), []),
  createdAt: String(row.created_at), updatedAt: String(row.updated_at),
})

export class SqlitePersistence implements Persistence {
  private db!: Database

  async init() {
    this.db = await Database.load('sqlite:yuan.db')
  }

  async listTodos(): Promise<Todo[]> {
    const rows = await this.db.select<Row[]>('SELECT * FROM todos ORDER BY updated_at DESC')
    return rows.map(todoFromRow)
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
    return rows.map(concernFromRow)
  }
  async insertConcernIfAbsent(concern: Concern) {
    const result = await this.db.execute(
      `INSERT OR IGNORE INTO concerns (id,title,raw_text,summary,source_type,source_url,tags_json,status,content_hash,created_at,updated_at,last_checked_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [concern.id, concern.title, concern.rawText, concern.summary, concern.sourceType,
        concern.sourceUrl, JSON.stringify(concern.tags), concern.status, concern.contentHash,
        concern.createdAt, concern.updatedAt, concern.lastCheckedAt],
    )
    if (result.rowsAffected > 0) return { inserted: true, existing: null }
    const rows = await this.db.select<Row[]>('SELECT * FROM concerns WHERE content_hash=$1 LIMIT 1', [concern.contentHash])
    return { inserted: false, existing: rows[0] ? concernFromRow(rows[0]) : null }
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
  async deleteSession(id: string) {
    await this.db.execute('BEGIN')
    try {
      await this.db.execute('DELETE FROM chat_messages WHERE session_id=$1', [id])
      await this.db.execute('DELETE FROM chat_sessions WHERE id=$1', [id])
      await this.db.execute('COMMIT')
    } catch (error) {
      await this.db.execute('ROLLBACK')
      throw error
    }
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

  async listProposalHistory(): Promise<AiProposalHistory[]> {
    const rows = await this.db.select<Array<{ history_json: string }>>(
      'SELECT history_json FROM ai_proposal_history ORDER BY applied_at DESC',
    )
    return rows.map((row) => JSON.parse(row.history_json) as AiProposalHistory)
  }
  async applyProposalTransaction(history: AiProposalHistory) {
    await this.db.execute('BEGIN')
    try {
      for (const change of history.concernChanges) await this.saveConcern(change.after)
      for (const todo of history.createdTodos) await this.saveTodo(todo)
      await this.db.execute(
        'INSERT INTO ai_proposal_history (id,applied_at,undone_at,history_json) VALUES ($1,$2,NULL,$3)',
        [history.id, history.appliedAt, JSON.stringify(history)],
      )
      await this.db.execute('COMMIT')
    } catch (error) {
      await this.db.execute('ROLLBACK')
      throw error
    }
  }
  async undoProposalTransaction(id: string): Promise<AiProposalHistory> {
    await this.db.execute('BEGIN')
    try {
      const rows = await this.db.select<Array<{ history_json: string; undone_at: string | null }>>(
        'SELECT history_json,undone_at FROM ai_proposal_history WHERE id=$1', [id],
      )
      if (!rows[0] || rows[0].undone_at) throw new Error('这次朱批不存在或已经撤销')
      const latest = await this.db.select<Array<{ id: string }>>(
        'SELECT id FROM ai_proposal_history WHERE undone_at IS NULL ORDER BY applied_at DESC LIMIT 1',
      )
      if (!latest[0] || latest[0].id !== id) throw new Error('只能撤销最近一次尚未撤销的朱批')
      const history = JSON.parse(rows[0].history_json) as AiProposalHistory
      for (const change of history.concernChanges) {
        const currentRows = await this.db.select<Row[]>('SELECT * FROM concerns WHERE id=$1', [change.after.id])
        const current = currentRows[0] ? concernFromRow(currentRows[0]) : null
        if (!current || JSON.stringify(current) !== JSON.stringify(change.after)) {
          throw new Error(`关心项“${change.after.title}”在朱批后已被修改，已停止撤销以保护新内容`)
        }
      }
      for (const created of history.createdTodos) {
        const currentRows = await this.db.select<Row[]>('SELECT * FROM todos WHERE id=$1', [created.id])
        const current = currentRows[0] ? todoFromRow(currentRows[0]) : null
        if (!current || JSON.stringify(current) !== JSON.stringify(created)) {
          throw new Error(`待办“${created.title}”在朱批后已被修改，已停止撤销以保护新内容`)
        }
      }
      for (const change of history.concernChanges) await this.saveConcern(change.before)
      for (const todo of history.createdTodos) await this.deleteTodo(todo.id)
      const undoneAt = new Date().toISOString()
      const next = { ...history, undoneAt }
      await this.db.execute(
        'UPDATE ai_proposal_history SET undone_at=$2,history_json=$3 WHERE id=$1',
        [id, undoneAt, JSON.stringify(next)],
      )
      await this.db.execute('COMMIT')
      return next
    } catch (error) {
      await this.db.execute('ROLLBACK')
      throw error
    }
  }

  async getSettings(): Promise<AppSettings> {
    const rows = await this.db.select<Array<{ value_json: string }>>('SELECT value_json FROM app_settings WHERE key=$1', ['app'])
    return rows[0] ? { ...DEFAULT_SETTINGS, ...json(rows[0].value_json, {}) } : DEFAULT_SETTINGS
  }
  async saveSettings(settings: AppSettings) {
    await this.db.execute('INSERT OR REPLACE INTO app_settings (key,value_json) VALUES ($1,$2)', ['app', JSON.stringify(settings)])
  }

  async exportBackup(): Promise<AppBackup> {
    const [todos, concerns, sources, news, sessions, messages, proposalHistory, settings] = await Promise.all([
      this.listTodos(), this.listConcerns(), this.listSources(), this.listNews(),
      this.listSessions(), this.listMessages(), this.listProposalHistory(), this.getSettings(),
    ])
    return { version: 1, exportedAt: new Date().toISOString(), todos, concerns, sources, news, sessions, messages, proposalHistory, settings }
  }

  async importBackup(backup: AppBackup) {
    await this.db.execute('BEGIN')
    try {
      await this.clearAll(false)
      for (const value of backup.todos) await this.saveTodo(value)
      for (const value of backup.concerns) await this.insertConcernIfAbsent(value)
      for (const value of backup.sources) await this.saveSource(value)
      await this.saveNews(backup.news)
      for (const value of backup.sessions) await this.saveSession(value)
      for (const value of backup.messages) await this.saveMessage(value)
      for (const history of backup.proposalHistory) {
        await this.db.execute(
          'INSERT INTO ai_proposal_history (id,applied_at,undone_at,history_json) VALUES ($1,$2,$3,$4)',
          [history.id, history.appliedAt, history.undoneAt, JSON.stringify(history)],
        )
      }
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
      for (const table of ['ai_proposal_history','chat_messages','chat_sessions','news_items','content_sources','concerns','todos','app_settings']) {
        await this.db.execute(`DELETE FROM ${table}`)
      }
      if (withTransaction) await this.db.execute('COMMIT')
    } catch (error) {
      if (withTransaction) await this.db.execute('ROLLBACK')
      throw error
    }
  }

  async getDatabaseDiagnostics(): Promise<DatabaseDiagnostics> {
    const checkedAt = new Date().toISOString()
    try {
      const integrityRows = await this.db.select<Array<Record<string, string>>>('PRAGMA integrity_check')
      const integrityMessage = Object.values(integrityRows[0] ?? {})[0] ?? 'unknown'
      const foreignKeys = await this.db.select<Row[]>('PRAGMA foreign_key_check')
      let schemaVersion: number | null = null
      let appliedMigrations = 0
      try {
        const migrations = await this.db.select<Array<{ version: number | string }>>(
          'SELECT version FROM _sqlx_migrations WHERE success=1 ORDER BY version',
        )
        appliedMigrations = migrations.length
        schemaVersion = migrations.length ? Number(migrations[migrations.length - 1].version) : null
      } catch {
        // Older SQL plugin builds may not expose their migration ledger.
      }
      const healthy = integrityMessage.toLowerCase() === 'ok' && foreignKeys.length === 0
      return {
        engine: 'sqlite', status: healthy ? 'healthy' : 'warning', schemaVersion,
        appliedMigrations, integrityMessage, foreignKeyIssues: foreignKeys.length, checkedAt,
      }
    } catch (cause) {
      return {
        engine: 'sqlite', status: 'error', schemaVersion: null, appliedMigrations: 0,
        integrityMessage: cause instanceof Error ? cause.message : '数据库诊断失败',
        foreignKeyIssues: 0, checkedAt,
      }
    }
  }
}
