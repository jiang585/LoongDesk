import { describe, expect, it } from 'vitest'
import { aiProposalSchema } from './schemas'

describe('AI proposal schema', () => {
  it('accepts a structured preview', () => {
    const result = aiProposalSchema.parse({
      overview: '两件要事',
      concernUpdates: [{ id: '1', summary: '摘要', tags: ['行业'] }],
      todoSuggestions: [{ title: '继续跟进', priority: 'high' }],
    })
    expect(result.todoSuggestions).toHaveLength(1)
  })

  it('rejects a proposal with an unsupported priority', () => {
    expect(() => aiProposalSchema.parse({ overview: '', concernUpdates: [], todoSuggestions: [{ title: 'x', priority: 'urgent' }] })).toThrow()
  })
})

