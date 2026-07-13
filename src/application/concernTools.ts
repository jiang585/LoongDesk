import type { Concern, ConcernLocalRule, ConcernSavedFilter, TodoPriority } from '../domain/models'

export type ConcernFilter = ConcernSavedFilter

export type ConcernRule = ConcernLocalRule

export interface RuleResult {
  summary?: string
  tags: string[]
  todo?: { title: string; details: string; priority: TodoPriority }
}

export function concernMatchesFilter(concern: Concern, filter: Omit<ConcernFilter, 'id' | 'name'>): boolean {
  if (filter.status !== 'all' && concern.status !== filter.status) return false
  if (filter.sourceType !== 'all' && concern.sourceType !== filter.sourceType) return false
  if (filter.tags.length && !filter.tags.every((tag) => concern.tags.some((value) => value.toLowerCase() === tag.toLowerCase()))) return false
  const terms = filter.query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const haystack = [concern.title, concern.summary, concern.rawText, concern.sourceUrl ?? '', ...concern.tags].join('\n').toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export function htmlToSafeText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('script,style,noscript,iframe,object,embed,svg,form').forEach((node) => node.remove())
  return (document.body.textContent ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

export function applyConcernRules(concern: Concern, rules: ConcernRule[]): RuleResult {
  const text = `${concern.title}\n${concern.rawText}`.toLowerCase()
  const matched = rules.filter((rule) => rule.enabled && rule.keywords.some((keyword) => keyword.trim() && text.includes(keyword.trim().toLowerCase())))
  const tags = [...new Set([...concern.tags, ...matched.flatMap((rule) => rule.addTags)])]
  const first = matched[0]
  if (!first) return { tags }
  const variables: Record<string, string> = {
    title: concern.title,
    summary: concern.summary,
    source: concern.sourceUrl ?? '',
    text: concern.rawText.slice(0, 500),
  }
  const render = (template: string) => template.replace(/\{(title|summary|source|text)\}/g, (_, key: string) => variables[key] ?? '')
  return {
    tags,
    summary: first.summaryTemplate.trim() ? render(first.summaryTemplate).slice(0, 1000) : undefined,
    todo: first.todoTemplate.trim() ? {
      title: render(first.todoTemplate).slice(0, 120),
      details: `由本地规则“${first.name}”从关心事项“${concern.title}”生成`,
      priority: first.todoPriority,
    } : undefined,
  }
}

export interface TextDiffPart { type: 'same' | 'added' | 'removed'; text: string }

/** Small deterministic word-level diff, capped by callers to snapshot summaries. */
export function diffText(before: string, after: string): TextDiffPart[] {
  const left = before.split(/(\s+)/).filter(Boolean).slice(0, 600)
  const right = after.split(/(\s+)/).filter(Boolean).slice(0, 600)
  const rows = left.length + 1
  const cols = right.length + 1
  const table = new Uint16Array(rows * cols)
  for (let i = 1; i < rows; i += 1) for (let j = 1; j < cols; j += 1) {
    table[i * cols + j] = left[i - 1] === right[j - 1]
      ? table[(i - 1) * cols + j - 1] + 1
      : Math.max(table[(i - 1) * cols + j], table[i * cols + j - 1])
  }
  const parts: TextDiffPart[] = []
  const push = (type: TextDiffPart['type'], text: string) => {
    const last = parts.at(-1)
    if (last?.type === type) last.text = `${text}${last.text}`
    else parts.push({ type, text })
  }
  let i = left.length; let j = right.length
  while (i || j) {
    if (i && j && left[i - 1] === right[j - 1]) { push('same', left[--i]); j -= 1 }
    else if (j && (!i || table[i * cols + j - 1] >= table[(i - 1) * cols + j])) push('added', right[--j])
    else push('removed', left[--i])
  }
  return parts.reverse()
}
