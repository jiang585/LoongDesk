import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type Todo } from '../../domain/models'
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
})

