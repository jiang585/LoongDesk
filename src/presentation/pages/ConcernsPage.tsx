import {
  Archive, CheckSquare, ClipboardPaste, Edit3, Eye, FileText, Filter, Globe2,
  LibraryBig, Plus, RotateCcw, Save, Search, Sparkles, Tags, Trash2, UploadCloud, WandSparkles, X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Concern, ConcernSourceType } from '../../domain/models'
import {
  applyConcernRules, concernMatchesFilter, diffText, htmlToSafeText,
  type ConcernFilter, type ConcernRule,
} from '../../application/concernTools'
import { newId, nowIso } from '../../application/services'
import { TauriContentProvider } from '../../infrastructure/contentProvider'
import { useApp } from '../state/AppContext'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'
import './v03.css'

const contentProvider = new TauriContentProvider()
const emptyFilter = { query: '', status: 'active' as const, sourceType: 'all' as const, tags: [] as string[] }

export function ConcernsPage() {
  const { concerns, captureConcern, updateConcern, deleteConcern, createTodo, settings, saveSettings, setNotice } = useApp()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<Omit<ConcernFilter, 'id' | 'name'>>(emptyFilter)
  const [savedFilters, setSavedFilters] = useState(settings.concernFilters)
  const [rules, setRules] = useState(settings.concernRules)
  const [editor, setEditor] = useState<Concern | null | 'new'>(null)
  const [duplicate, setDuplicate] = useState<Concern | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filterName, setFilterName] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [review, setReview] = useState<{ concern: Concern; title: string; summary: string } | null>(null)
  const [checking, setChecking] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => concerns.filter((item) => concernMatchesFilter(item, filter)), [concerns, filter])
  const allTags = useMemo(() => [...new Set(concerns.flatMap((item) => item.tags))].sort(), [concerns])

  useEffect(() => {
    if (params.get('capture') === '1') { setEditor('new'); setParams({}, { replace: true }) }
  }, [params, setParams])
  useEffect(() => { setSavedFilters(settings.concernFilters); setRules(settings.concernRules) }, [settings.concernFilters, settings.concernRules])

  const capture = async (text: string, type: ConcernSourceType) => {
    try {
      const result = await captureConcern(text, type)
      if (result.duplicate) setDuplicate(result.duplicate)
      else setNotice('已收录到关心库')
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : '未能收录这份内容') }
  }

  const readFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1_048_576) { setNotice(`${file.name} 超过 10MB，未收录`); continue }
      if (/\.pdf$/i.test(file.name)) { setNotice('PDF 请直接拖入御案窗口，由本地安全提取器读取'); continue }
      if (!/\.(txt|md|markdown|html?|xhtml)$/i.test(file.name)) { setNotice(`暂不支持 ${file.name}`); continue }
      const source = await file.text()
      await capture(/\.html?$/i.test(file.name) ? htmlToSafeText(source) : source, 'file')
    }
  }

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next
  })

  const batchStatus = async (status: Concern['status']) => {
    await Promise.all(concerns.filter((item) => selected.has(item.id)).map((item) => updateConcern({ ...item, status })))
    setSelected(new Set()); setNotice(`已批量${status === 'active' ? '恢复' : '归档'}`)
  }
  const batchTag = async () => {
    const tag = prompt('输入要添加的标签')?.trim(); if (!tag) return
    await Promise.all(concerns.filter((item) => selected.has(item.id)).map((item) => updateConcern({ ...item, tags: [...new Set([...item.tags, tag])] })))
    setNotice(`已为 ${selected.size} 条事项添加 #${tag}`)
  }
  const batchDelete = async () => {
    if (!confirm(`确定永久删除选中的 ${selected.size} 条关心事项？`)) return
    await Promise.all([...selected].map(deleteConcern)); setSelected(new Set()); setNotice('已批量删除')
  }
  const runRules = async () => {
    const targets = concerns.filter((item) => selected.has(item.id))
    let changed = 0; let todos = 0
    for (const concern of targets) {
      const result = applyConcernRules(concern, rules)
      if (result.summary || result.tags.join() !== concern.tags.join()) {
        await updateConcern({ ...concern, summary: result.summary ?? concern.summary, tags: result.tags }); changed += 1
      }
      if (result.todo) { await createTodo(result.todo); todos += 1 }
    }
    setNotice(`本地规则已处理 ${changed} 条，生成 ${todos} 项待办`)
  }
  const recheck = async (concern: Concern) => {
    if (!concern.sourceUrl) return
    setChecking(concern.id)
    try {
      const snapshot = await contentProvider.fetchWebSnapshot(concern.sourceUrl)
      setReview({ concern, title: snapshot.title, summary: snapshot.summary })
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : '网页复查失败') }
    finally { setChecking(null) }
  }

  const persistFilters = (next: ConcernFilter[]) => { setSavedFilters(next); void saveSettings({ ...settings, concernFilters: next }) }
  const persistRules = (next: ConcernRule[]) => { setRules(next); void saveSettings({ ...settings, concernRules: next }) }

  return <div className="page v03-concerns">
    <header className="page-heading"><div><span className="eyebrow">留心世事</span><h1>关心库</h1><p>全文检索、批量整理，并追踪网页关注项的变化。</p></div><button className="primary-button" onClick={() => setEditor('new')}><Plus size={17} /> 手工呈上</button></header>
    <section className="capture-zone">
      <span className="capture-icon"><UploadCloud size={25} /></span><div><strong>拖入文字或卷宗</strong><p>支持文字、网址、TXT、Markdown、HTML 与 PDF；文件仅在本地提取文本。</p></div>
      <div className="capture-actions"><button className="secondary-button" onClick={async () => { try { await capture(await navigator.clipboard.readText(), 'paste') } catch { setNotice('无法读取剪贴板') } }}><ClipboardPaste size={16} /> 粘贴收录</button><button className="secondary-button" onClick={() => fileRef.current?.click()}><FileText size={16} /> 选择文件</button><input ref={fileRef} hidden type="file" accept=".txt,.md,.markdown,.html,.htm,.pdf" multiple onChange={(event) => event.target.files && void readFiles(event.target.files)} /></div>
    </section>

    <section className="paper-panel v03-searchbar">
      <label className="search-box"><Search size={16} /><input value={filter.query} onChange={(event) => setFilter({ ...filter, query: event.target.value })} placeholder="全文检索标题、摘要、原文、标签与来源……" /></label>
      <button className="secondary-button" onClick={() => setShowFilters((value) => !value)}><Filter size={15} /> 筛选</button>
      <button className="secondary-button" onClick={() => setShowRules(true)}><WandSparkles size={15} /> 本地规则</button>
    </section>
    {showFilters && <section className="paper-panel v03-filter-panel">
      <label>状态<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value as ConcernFilter['status'] })}><option value="all">全部</option><option value="active">正在关心</option><option value="archived">已归档</option></select></label>
      <label>来源<select value={filter.sourceType} onChange={(event) => setFilter({ ...filter, sourceType: event.target.value as ConcernFilter['sourceType'] })}><option value="all">全部</option><option value="manual">手工</option><option value="paste">粘贴</option><option value="drop">拖入</option><option value="file">文件</option><option value="url">网页</option></select></label>
      <div className="v03-tags">{allTags.map((tag) => <button key={tag} className={filter.tags.includes(tag) ? 'active' : ''} onClick={() => setFilter({ ...filter, tags: filter.tags.includes(tag) ? filter.tags.filter((value) => value !== tag) : [...filter.tags, tag] })}>#{tag}</button>)}</div>
      <div className="v03-save-filter"><input value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="筛选器名称" /><button className="secondary-button" disabled={!filterName.trim()} onClick={() => { persistFilters([...savedFilters, { ...filter, id: newId(), name: filterName.trim() }]); setFilterName('') }}><Save size={14} /> 保存当前筛选</button></div>
      <div className="v03-saved-filters">{savedFilters.map((item) => <span key={item.id}><button onClick={() => setFilter({ query: item.query, status: item.status, sourceType: item.sourceType, tags: item.tags })}>{item.name}</button><button aria-label={`删除筛选器 ${item.name}`} onClick={() => persistFilters(savedFilters.filter((value) => value.id !== item.id))}><X size={12} /></button></span>)}</div>
    </section>}

    <section className="paper-panel v03-selectionbar"><div><LibraryBig size={17} /><strong>{visible.length}</strong> 条结果 · 已选 {selected.size} 条</div><div>{selected.size > 0 && <><button onClick={() => void batchStatus('archived')}><Archive size={14} />归档</button><button onClick={() => void batchStatus('active')}><RotateCcw size={14} />恢复</button><button onClick={() => void batchTag()}><Tags size={14} />加标签</button><button onClick={() => void runRules()}><WandSparkles size={14} />应用规则</button><button className="danger" onClick={() => void batchDelete()}><Trash2 size={14} />删除</button></>}<button onClick={() => setSelected(selected.size === visible.length ? new Set() : new Set(visible.map((item) => item.id)))}><CheckSquare size={14} />{selected.size === visible.length && visible.length ? '取消全选' : '全选'}</button></div></section>

    <section className="concern-grid">{visible.length ? visible.map((concern) => <article className={`paper-panel concern-card ${selected.has(concern.id) ? 'selected' : ''}`} key={concern.id}>
      <header><label className="v03-checkbox"><input type="checkbox" checked={selected.has(concern.id)} onChange={() => toggle(concern.id)} /><span /></label><span className={`source-badge ${concern.sourceType}`}>{concern.sourceType === 'url' ? <Globe2 size={13} /> : <FileText size={13} />}{sourceLabel(concern.sourceType)}</span><div className="row-actions">{concern.sourceUrl && <button disabled={checking === concern.id} onClick={() => void recheck(concern)} title="复查网页变化"><Eye size={15} /></button>}<button onClick={() => setEditor(concern)} title="编辑"><Edit3 size={15} /></button><button onClick={() => void updateConcern({ ...concern, status: concern.status === 'active' ? 'archived' : 'active' })} title={concern.status === 'active' ? '归档' : '恢复'}><Archive size={15} /></button></div></header>
      <h2>{concern.title}</h2><p>{concern.summary || concern.rawText.slice(0, 220)}</p><footer><div className="tag-list">{concern.tags.length ? concern.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>) : <span className="muted">尚未加签</span>}</div><time>{concern.lastCheckedAt ? `复查 ${new Date(concern.lastCheckedAt).toLocaleDateString('zh-CN')}` : new Date(concern.updatedAt).toLocaleDateString('zh-CN')}</time></footer>
    </article>) : <div className="paper-panel concern-empty"><EmptyState title="没有符合条件的事项" detail="调整全文关键词或筛选条件，亦可呈上一件新的关心事项。" /></div>}</section>

    {editor && <ConcernEditor concern={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSave={async (value) => { if (editor === 'new') await capture(value.rawText, 'manual'); else await updateConcern({ ...editor, ...value }); setEditor(null) }} />}
    {duplicate && <Modal title="此事似曾呈过" onClose={() => setDuplicate(null)}><div className="duplicate-box"><Sparkles /><p>关心库中已有完全相同的内容：</p><strong>{duplicate.title}</strong><div className="modal-actions"><button className="primary-button" onClick={() => { setEditor(duplicate); setDuplicate(null) }}>打开旧卷</button><button className="secondary-button" onClick={() => setDuplicate(null)}>知道了</button></div></div></Modal>}
    {review && <ReviewModal value={review} onClose={() => setReview(null)} onApply={async () => { await updateConcern({ ...review.concern, title: review.title, summary: review.summary, lastCheckedAt: nowIso() }); setReview(null); setNotice('网页快照已更新，旧内容未在后台执行') }} />}
    {showRules && <RulesModal rules={rules} onClose={() => setShowRules(false)} onSave={persistRules} />}
  </div>
}

const sourceLabel = (type: ConcernSourceType) => ({ manual: '手工', paste: '粘贴', drop: '拖入', file: '卷宗', url: '网页' })[type]

function ConcernEditor({ concern, onClose, onSave }: { concern: Concern | null; onClose(): void; onSave(value: Pick<Concern, 'title' | 'rawText' | 'summary' | 'tags'>): Promise<void> }) {
  const [title, setTitle] = useState(concern?.title ?? ''); const [rawText, setRawText] = useState(concern?.rawText ?? ''); const [summary, setSummary] = useState(concern?.summary ?? ''); const [tags, setTags] = useState(concern?.tags.join('，') ?? '')
  return <Modal title={concern ? '修订关心事项' : '呈上关心事项'} onClose={onClose} wide><form className="form-stack" onSubmit={async (event) => { event.preventDefault(); const text = rawText.trim(); if (!text) return; await onSave({ title: title.trim() || text.slice(0, 56), rawText: text, summary: summary.trim() || text.replace(/\s+/g, ' ').slice(0, 180), tags: tags.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean) }) }}>{concern && <label><span>标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>}<label><span>原文或 HTTPS 链接</span><textarea autoFocus={!concern} rows={8} value={rawText} onChange={(event) => setRawText(event.target.value)} /></label>{concern && <><label><span>摘要</span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label><label><span>标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} /></label></>}<footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!rawText.trim()}>收进关心库</button></footer></form></Modal>
}

function ReviewModal({ value, onClose, onApply }: { value: { concern: Concern; title: string; summary: string }; onClose(): void; onApply(): Promise<void> }) {
  const changed = value.concern.title !== value.title || value.concern.summary !== value.summary
  return <Modal title="网页复查与变化对比" onClose={onClose} wide><div className="v03-review"><p>{changed ? '发现网页内容变化，请确认后更新本地快照。' : '网页内容与上次快照一致。'}</p><div className="v03-diff"><section><h3>旧快照</h3><strong>{value.concern.title}</strong><p>{value.concern.summary}</p></section><section><h3>新快照</h3><strong>{value.title}</strong><p>{diffText(value.concern.summary, value.summary).map((part, index) => <mark className={part.type} key={index}>{part.text}</mark>)}</p></section></div><footer className="modal-actions"><button className="secondary-button" onClick={onClose}>保留旧快照</button><button className="primary-button" onClick={() => void onApply()}>确认更新</button></footer></div></Modal>
}

function RulesModal({ rules, onClose, onSave }: { rules: ConcernRule[]; onClose(): void; onSave(values: ConcernRule[]): void }) {
  const [draft, setDraft] = useState(rules); const [name, setName] = useState(''); const [keywords, setKeywords] = useState(''); const [tags, setTags] = useState(''); const [summary, setSummary] = useState(''); const [todo, setTodo] = useState('')
  return <Modal title="本地整理规则" onClose={onClose} wide><div className="v03-rules"><p>规则完全在本机运行。模板可使用 <code>{'{title}'}</code>、<code>{'{summary}'}</code>、<code>{'{source}'}</code> 与 <code>{'{text}'}</code>。</p><div className="v03-rule-form"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="规则名称" /><input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="关键词，逗号分隔" /><input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="自动标签" /><input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="摘要模板（可选）" /><input value={todo} onChange={(e) => setTodo(e.target.value)} placeholder="待办标题模板（可选）" /><button className="secondary-button" disabled={!name.trim() || !keywords.trim()} onClick={() => { setDraft([...draft, { id: newId(), name: name.trim(), enabled: true, keywords: keywords.split(/[,，]/).map((x) => x.trim()).filter(Boolean), addTags: tags.split(/[,，]/).map((x) => x.trim()).filter(Boolean), summaryTemplate: summary, todoTemplate: todo, todoPriority: 'medium' }]); setName(''); setKeywords(''); setTags(''); setSummary(''); setTodo('') }}><Plus size={14} />添加规则</button></div>{draft.map((rule) => <div className="v03-rule-row" key={rule.id}><input type="checkbox" checked={rule.enabled} onChange={() => setDraft(draft.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))} /><div><strong>{rule.name}</strong><small>{rule.keywords.join('、')} → {rule.addTags.map((tag) => `#${tag}`).join(' ') || '仅模板'}</small></div><button onClick={() => setDraft(draft.filter((item) => item.id !== rule.id))}><Trash2 size={14} /></button></div>)}<footer className="modal-actions"><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" onClick={() => { onSave(draft); onClose() }}>保存规则</button></footer></div></Modal>
}
