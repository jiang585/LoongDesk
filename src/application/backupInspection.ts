import type { AppBackup, BackupInspection } from '../domain/models'
import { backupSchema } from '../domain/schemas'
import { hashText } from './services'

function duplicates(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index)
}

export async function inspectBackup(raw: unknown): Promise<BackupInspection> {
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const location = issue?.path.length ? issue.path.join('.') : '根节点'
    throw new Error(`备份格式无效：${location} ${issue?.message ?? '无法识别'}`)
  }

  const backup = parsed.data as AppBackup
  const warnings: string[] = []
  const sessionIds = new Set(backup.sessions.map((item) => item.id))
  const sourceIds = new Set(backup.sources.map((item) => item.id))
  const concernIds = new Set(backup.concerns.map((item) => item.id))
  const orphanMessages = backup.messages.filter((item) => !sessionIds.has(item.sessionId)).length
  const orphanNews = backup.news.filter((item) => !sourceIds.has(item.sourceId)).length
  const staleMatches = backup.news.reduce(
    (count, item) => count + item.matchedConcernIds.filter((id) => !concernIds.has(id)).length,
    0,
  )

  if (orphanMessages) warnings.push(`${orphanMessages} 条聊天消息找不到所属会话，将无法安全恢复`)
  if (orphanNews) warnings.push(`${orphanNews} 条奏报找不到所属来源，将无法安全恢复`)
  if (staleMatches) warnings.push(`${staleMatches} 个奏报关联指向不存在的关心项`)
  if (duplicates(backup.concerns.map((item) => item.contentHash)).length) warnings.push('关心库包含重复内容，恢复时将自动去重')

  for (const [name, ids] of [
    ['待办', backup.todos.map((item) => item.id)],
    ['关心项', backup.concerns.map((item) => item.id)],
    ['来源', backup.sources.map((item) => item.id)],
    ['奏报', backup.news.map((item) => item.id)],
    ['会话', backup.sessions.map((item) => item.id)],
    ['消息', backup.messages.map((item) => item.id)],
  ] as const) {
    if (duplicates(ids).length) warnings.push(`${name}包含重复 ID`)
  }

  if (orphanMessages || orphanNews) throw new Error(`备份关联校验失败：${warnings.join('；')}`)

  const fingerprint = (await hashText(JSON.stringify(backup))).slice(0, 12).toUpperCase()
  return {
    backup,
    counts: {
      todos: backup.todos.length, concerns: backup.concerns.length,
      sources: backup.sources.length, news: backup.news.length,
      sessions: backup.sessions.length, messages: backup.messages.length,
      proposalHistory: backup.proposalHistory.length,
      concernFilters: backup.settings.concernFilters.length,
      concernRules: backup.settings.concernRules.length,
    },
    warnings,
    fingerprint,
  }
}
