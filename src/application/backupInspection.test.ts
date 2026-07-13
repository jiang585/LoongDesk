import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppBackup } from '../domain/models'
import { inspectBackup } from './backupInspection'

const backup = (changes: Partial<AppBackup> = {}): AppBackup => ({
  version: 1,
  exportedAt: '2026-07-13T10:00:00.000Z',
  todos: [], concerns: [], sources: [], news: [], sessions: [], messages: [],
  proposalHistory: [], settings: DEFAULT_SETTINGS,
  ...changes,
})

describe('inspectBackup', () => {
  it('returns counts and a stable fingerprint after structural validation', async () => {
    const value = backup({
      sessions: [{ id: 'session-1', title: '会话', createdAt: 'now', updatedAt: 'now' }],
      messages: [{ id: 'message-1', sessionId: 'session-1', role: 'user', content: '测试', createdAt: 'now' }],
    })
    const first = await inspectBackup(value)
    const second = await inspectBackup(value)
    expect(first.counts).toMatchObject({ sessions: 1, messages: 1 })
    expect(first.fingerprint).toBe(second.fingerprint)
  })

  it('rejects orphaned messages before recovery', async () => {
    const value = backup({
      messages: [{ id: 'message-1', sessionId: 'missing', role: 'user', content: '测试', createdAt: 'now' }],
    })
    await expect(inspectBackup(value)).rejects.toThrow('聊天消息找不到所属会话')
  })

  it('accepts older v1 backups without proposal history', async () => {
    const value = backup() as unknown as Record<string, unknown>
    delete value.proposalHistory
    await expect(inspectBackup(value)).resolves.toMatchObject({ backup: { proposalHistory: [] } })
  })
})
