import { z } from 'zod'

export const aiProposalSchema = z.object({
  overview: z.string().default(''),
  concernUpdates: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  todoSuggestions: z
    .array(
      z.object({
        title: z.string(),
        details: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
      }),
    )
    .default([]),
})

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.iso.datetime(),
  todos: z.array(z.object({
    id: z.string().min(1), title: z.string(), details: z.string(),
    status: z.enum(['pending', 'done', 'snoozed', 'archived']),
    priority: z.enum(['low', 'medium', 'high']), dueAt: z.string().nullable(),
    tags: z.array(z.string()), createdAt: z.string(), updatedAt: z.string(),
  })),
  concerns: z.array(z.object({
    id: z.string().min(1), title: z.string(), rawText: z.string(), summary: z.string(),
    sourceType: z.enum(['manual', 'paste', 'drop', 'file', 'url']), sourceUrl: z.string().nullable(),
    tags: z.array(z.string()), status: z.enum(['active', 'archived']), contentHash: z.string().min(1),
    createdAt: z.string(), updatedAt: z.string(), lastCheckedAt: z.string().nullable(),
  })),
  sources: z.array(z.object({
    id: z.string().min(1), name: z.string(), kind: z.enum(['rss', 'atom', 'webpage']),
    url: z.string(), enabled: z.boolean(), lastFetchedAt: z.string().nullable(),
    lastError: z.string().nullable(), createdAt: z.string(),
  })),
  news: z.array(z.object({
    id: z.string().min(1), sourceId: z.string(), externalId: z.string(), title: z.string(),
    summary: z.string(), url: z.string(), publishedAt: z.string().nullable(), fetchedAt: z.string(),
    matchedConcernIds: z.array(z.string()),
  })),
  sessions: z.array(z.object({
    id: z.string().min(1), title: z.string(), createdAt: z.string(), updatedAt: z.string(),
  })),
  messages: z.array(z.object({
    id: z.string().min(1), sessionId: z.string(), role: z.enum(['user', 'assistant']),
    content: z.string(), createdAt: z.string(),
  })),
  proposalHistory: z.array(z.object({
    id: z.string(), overview: z.string(), appliedAt: z.string(), undoneAt: z.string().nullable(),
    concernChanges: z.array(z.object({
      before: z.object({
        id: z.string(), title: z.string(), rawText: z.string(), summary: z.string(),
        sourceType: z.enum(['manual', 'paste', 'drop', 'file', 'url']), sourceUrl: z.string().nullable(),
        tags: z.array(z.string()), status: z.enum(['active', 'archived']), contentHash: z.string(),
        createdAt: z.string(), updatedAt: z.string(), lastCheckedAt: z.string().nullable(),
      }),
      after: z.object({
        id: z.string(), title: z.string(), rawText: z.string(), summary: z.string(),
        sourceType: z.enum(['manual', 'paste', 'drop', 'file', 'url']), sourceUrl: z.string().nullable(),
        tags: z.array(z.string()), status: z.enum(['active', 'archived']), contentHash: z.string(),
        createdAt: z.string(), updatedAt: z.string(), lastCheckedAt: z.string().nullable(),
      }),
    })),
    createdTodos: z.array(z.object({
      id: z.string(), title: z.string(), details: z.string(),
      status: z.enum(['pending', 'done', 'snoozed', 'archived']), priority: z.enum(['low', 'medium', 'high']),
      dueAt: z.string().nullable(), tags: z.array(z.string()), createdAt: z.string(), updatedAt: z.string(),
    })),
  })).optional().default([]),
  settings: z.object({
    model: z.enum(['deepseek-v4-flash', 'deepseek-v4-pro']), thinkingEnabled: z.boolean(),
    onboardingComplete: z.boolean(), vaultConfigured: z.boolean(),
    refreshIntervalMinutes: z.number().positive(), cacheRetentionDays: z.number().positive(),
    fontScale: z.union([z.literal(1), z.literal(1.12), z.literal(1.25)]),
    petEnabled: z.boolean(), petAlwaysOnTop: z.boolean(),
    petBounds: z.object({ x: z.number(), y: z.number() }).nullable(),
    concernFilters: z.array(z.object({
      id: z.string(), name: z.string(), query: z.string(), status: z.enum(['active', 'archived', 'all']),
      sourceType: z.enum(['manual', 'paste', 'drop', 'file', 'url', 'all']), tags: z.array(z.string()),
    })).optional().default([]),
    concernRules: z.array(z.object({
      id: z.string(), name: z.string(), enabled: z.boolean(), keywords: z.array(z.string()),
      summaryTemplate: z.string(), addTags: z.array(z.string()), todoTemplate: z.string(),
      todoPriority: z.enum(['low', 'medium', 'high']),
    })).optional().default([]),
  }),
})
