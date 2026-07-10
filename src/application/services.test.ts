import { describe, expect, it } from 'vitest'
import type { Concern } from '../domain/models'
import { contextPreview, hashText, matchConcernIds } from './services'

const concern: Concern = {
  id: 'concern-1', title: '关注人工智能产业', rawText: '人工智能', summary: '',
  sourceType: 'manual', sourceUrl: null, tags: ['AI', '大模型'], status: 'active',
  contentHash: 'hash', createdAt: '2026-01-01', updatedAt: '2026-01-01', lastCheckedAt: null,
}

describe('domain services', () => {
  it('normalizes whitespace before hashing', async () => {
    await expect(hashText('御案   待办')).resolves.toBe(await hashText('御案 待办'))
  })

  it('matches news with concern title and tags locally', () => {
    expect(matchConcernIds({ title: '大模型产业迎来更新', summary: '' }, [concern])).toEqual(['concern-1'])
    expect(matchConcernIds({ title: '今日天气晴朗', summary: '' }, [concern])).toEqual([])
  })

  it('caps assistant context at 50 records and 20k characters', () => {
    const values = Array.from({ length: 80 }, (_, index) => ({ index, text: '字'.repeat(500) }))
    const result = contextPreview(values, (item) => item.text)
    expect(result.items.length).toBe(40)
    expect(result.textLength).toBe(20_000)
  })
})

