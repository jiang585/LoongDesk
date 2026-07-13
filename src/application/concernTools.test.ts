import { describe, expect, it } from 'vitest'
import type { Concern } from '../domain/models'
import { applyConcernRules, concernMatchesFilter, diffText, htmlToSafeText } from './concernTools'

const concern: Concern = {
  id: '1', title: '关注人工智能产业', rawText: 'DeepSeek 发布新模型', summary: '行业动态',
  sourceType: 'manual', sourceUrl: null, tags: ['科技'], status: 'active', contentHash: 'h',
  createdAt: '2026-01-01', updatedAt: '2026-01-01', lastCheckedAt: null,
}

describe('concern v0.3 tools', () => {
  it('searches full text and tags with AND semantics', () => {
    expect(concernMatchesFilter(concern, { query: 'deepseek 模型', status: 'active', sourceType: 'all', tags: ['科技'] })).toBe(true)
    expect(concernMatchesFilter(concern, { query: 'deepseek 财经', status: 'all', sourceType: 'all', tags: [] })).toBe(false)
  })
  it('extracts safe text from HTML', () => {
    expect(htmlToSafeText('<script>bad()</script><main><h1>标题</h1><p>正文</p></main>')).toContain('标题')
    expect(htmlToSafeText('<script>bad()</script><p>正文</p>')).not.toContain('bad')
  })
  it('applies deterministic local rules', () => {
    const result = applyConcernRules(concern, [{ id: 'r', name: 'AI', enabled: true, keywords: ['deepseek'], addTags: ['AI'], summaryTemplate: '{title}：{summary}', todoTemplate: '跟进 {title}', todoPriority: 'high' }])
    expect(result.tags).toEqual(['科技', 'AI'])
    expect(result.todo?.title).toContain('关注人工智能产业')
  })
  it('produces added and removed diff segments', () => {
    const parts = diffText('旧 内容', '新 内容')
    expect(parts.some((part) => part.type === 'removed')).toBe(true)
    expect(parts.some((part) => part.type === 'added')).toBe(true)
  })
})
