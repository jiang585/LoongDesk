import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AiProposalHistory, type ChatMessage, type ChatSession, type Concern, type Todo } from '../../domain/models'
import { WebPersistence } from './webPersistence'

describe('WebPersistence', () => {
  beforeEach(() => localStorage.clear())

  it('persists local records across repository instances', async () => {
    const first = new WebPersistence()
    await first.init()
    const todo: Todo = {
      id: 'todo-1', title: '批阅测试奏折', details: '', status: 'pending', priority: 'high',
      dueAt: null, tags: ['测试'], createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }
    await first.saveTodo(todo)

    const second = new WebPersistence()
    await second.init()
    await expect(second.listTodos()).resolves.toEqual([todo])
  })

  it('exports and restores a versioned backup without secrets', async () => {
    const persistence = new WebPersistence()
    await persistence.init()
    await persistence.saveSettings({ ...DEFAULT_SETTINGS, onboardingComplete: true, vaultConfigured: true })
    const backup = await persistence.exportBackup()
    expect(backup.version).toBe(1)
    expect(JSON.stringify(backup)).not.toContain('apiKey')
    await persistence.clearAll()
    await persistence.importBackup(backup)
    expect((await persistence.getSettings()).onboardingComplete).toBe(true)
  })

  it('atomically rejects a second concern with the same content hash', async () => {
    const persistence = new WebPersistence()
    await persistence.init()
    const first: Concern = {
      id: 'concern-1', title: '同一卷宗', rawText: '# 同一卷宗', summary: '', sourceType: 'file',
      sourceUrl: null, tags: [], status: 'active', contentHash: 'same-hash',
      createdAt: '2026-01-01', updatedAt: '2026-01-01', lastCheckedAt: null,
    }
    const second = { ...first, id: 'concern-2' }
    await expect(persistence.insertConcernIfAbsent(first)).resolves.toEqual({ inserted: true, existing: null })
    const duplicate = await persistence.insertConcernIfAbsent(second)
    expect(duplicate.inserted).toBe(false)
    expect(duplicate.existing?.id).toBe(first.id)
    await expect(persistence.listConcerns()).resolves.toHaveLength(1)
  })

  it('deletes a session together with all of its messages', async () => {
    const persistence = new WebPersistence()
    await persistence.init()
    const session: ChatSession = { id: 'session-1', title: '待删除', createdAt: 'now', updatedAt: 'now' }
    const message: ChatMessage = { id: 'message-1', sessionId: session.id, role: 'user', content: '内容', createdAt: 'now' }
    await persistence.saveSession(session)
    await persistence.saveMessage(message)
    await persistence.deleteSession(session.id)
    await expect(persistence.listSessions()).resolves.toEqual([])
    await expect(persistence.listMessages()).resolves.toEqual([])
  })

  it('applies and precisely undoes an AI proposal as one persistence operation', async () => {
    const persistence = new WebPersistence()
    await persistence.init()
    const before: Concern = {
      id: 'concern-1', title: '原题', rawText: '正文', summary: '', sourceType: 'manual', sourceUrl: null,
      tags: [], status: 'active', contentHash: 'hash', createdAt: 'before', updatedAt: 'before', lastCheckedAt: null,
    }
    const todo: Todo = {
      id: 'todo-ai', title: 'AI 待办', details: '', status: 'pending', priority: 'medium', dueAt: null,
      tags: [], createdAt: 'after', updatedAt: 'after',
    }
    await persistence.saveConcern(before)
    const history: AiProposalHistory = {
      id: 'history-1', overview: '整理', appliedAt: 'after', undoneAt: null,
      concernChanges: [{ before, after: { ...before, title: '新题', updatedAt: 'after' } }], createdTodos: [todo],
    }
    await persistence.applyProposalTransaction(history)
    expect((await persistence.listConcerns())[0].title).toBe('新题')
    await expect(persistence.listTodos()).resolves.toContainEqual(todo)

    const newer: AiProposalHistory = { id: 'history-2', overview: '更新整理', appliedAt: 'z-after', undoneAt: null, concernChanges: [], createdTodos: [] }
    await persistence.applyProposalTransaction(newer)
    await expect(persistence.undoProposalTransaction(history.id)).rejects.toThrow('只能撤销最近一次')
    await persistence.undoProposalTransaction(newer.id)
    const undone = await persistence.undoProposalTransaction(history.id)
    expect(undone.undoneAt).not.toBeNull()
    expect((await persistence.listConcerns())[0]).toEqual(before)
    await expect(persistence.listTodos()).resolves.toEqual([])
    await expect(persistence.undoProposalTransaction(history.id)).rejects.toThrow('已经撤销')
  })

  it('refuses to undo over user edits made after an AI proposal', async () => {
    const persistence = new WebPersistence()
    await persistence.init()
    const before: Concern = {
      id: 'concern-safe', title: '原题', rawText: '正文', summary: '', sourceType: 'manual', sourceUrl: null,
      tags: [], status: 'active', contentHash: 'safe-hash', createdAt: 'before', updatedAt: 'before', lastCheckedAt: null,
    }
    const after = { ...before, title: 'AI 标题', updatedAt: 'after' }
    await persistence.saveConcern(before)
    const history: AiProposalHistory = {
      id: 'history-safe', overview: '整理', appliedAt: 'after', undoneAt: null,
      concernChanges: [{ before, after }], createdTodos: [],
    }
    await persistence.applyProposalTransaction(history)
    await persistence.saveConcern({ ...after, title: '用户后来修改', updatedAt: 'later' })
    await expect(persistence.undoProposalTransaction(history.id)).rejects.toThrow('已停止撤销以保护新内容')
    expect((await persistence.listConcerns())[0].title).toBe('用户后来修改')
  })
})
