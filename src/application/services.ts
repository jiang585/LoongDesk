import type { Concern, NewsItem } from '../domain/models'

export const newId = () => crypto.randomUUID()
export const nowIso = () => new Date().toISOString()

export async function hashText(text: string): Promise<string> {
  const normalized = text.trim().replace(/\s+/g, ' ')
  const bytes = new TextEncoder().encode(normalized)
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  }
  let hash = 2166136261
  for (const value of bytes) hash = Math.imul(hash ^ value, 16777619)
  return (hash >>> 0).toString(16)
}

export function extractKeywords(concern: Concern): string[] {
  const fromTags = concern.tags.flatMap((tag) => tag.toLowerCase().split(/\s+/))
  const fromTitle = concern.title
    .toLowerCase()
    .split(/[\s，。；、：,.;:!?！？]/)
    .filter((word) => word.length >= 2)
  return [...new Set([...fromTags, ...fromTitle])].slice(0, 12)
}

export function matchConcernIds(
  item: Pick<NewsItem, 'title' | 'summary'>,
  concerns: Concern[],
): string[] {
  const haystack = `${item.title} ${item.summary}`.toLowerCase()
  return concerns
    .filter((concern) =>
      extractKeywords(concern).some((keyword) => haystack.includes(keyword)),
    )
    .map((concern) => concern.id)
}

export function contextPreview<T>(items: T[], serialize: (item: T) => string) {
  const selected: T[] = []
  let textLength = 0
  for (const item of items.slice(0, 50)) {
    const length = serialize(item).length
    if (textLength + length > 20_000) break
    selected.push(item)
    textLength += length
  }
  return { items: selected, textLength }
}

