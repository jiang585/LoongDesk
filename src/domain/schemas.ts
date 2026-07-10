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
  exportedAt: z.string(),
  todos: z.array(z.unknown()),
  concerns: z.array(z.unknown()),
  sources: z.array(z.unknown()),
  news: z.array(z.unknown()),
  sessions: z.array(z.unknown()),
  messages: z.array(z.unknown()),
  settings: z.record(z.string(), z.unknown()),
})

