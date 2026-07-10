import { AlertCircle, Clock3, ExternalLink, Link2, Plus, RefreshCw, Rss, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import type { ContentSource, NewsItem } from '../../domain/models'
import { newId, nowIso } from '../../application/services'
import { isTauri } from '../../infrastructure/platform'
import { useApp } from '../state/AppContext'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'

export function NewsPage() {
  const { news, sources, saveSource, deleteSource, refreshNews } = useApp()
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const sourceMap = new Map(sources.map((source) => [source.id, source]))
  const filtered = useMemo(() => news.filter((item) =>
    (sourceFilter === 'all' || sourceFilter === 'matched' || item.sourceId === sourceFilter) &&
    `${item.title} ${item.summary}`.toLowerCase().includes(search.toLowerCase()),
  ), [news, search, sourceFilter])

  const openArticle = async (item: NewsItem) => {
    if (isTauri()) await openUrl(item.url)
    else window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  return <div className="page">
    <header className="page-heading"><div><span className="eyebrow">四方闻见</span><h1>今日奏报</h1><p>只保存标题、摘要与原文链接，详情在系统浏览器中打开。</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => setAdding(true)}><Plus size={16} /> 添加来源</button><button className="primary-button" disabled={refreshing} onClick={async () => { setRefreshing(true); await refreshNews(); setRefreshing(false) }}><RefreshCw className={refreshing ? 'spin' : ''} size={16} /> {refreshing ? '驿骑奔走…' : '刷新奏报'}</button></div></header>
    <section className="source-strip">
      {sources.map((source) => <article className={`source-chip ${source.lastError ? 'has-error' : ''}`} key={source.id}>
        <button className="source-main" onClick={() => setSourceFilter(sourceFilter === source.id ? 'all' : source.id)}><Rss size={16} /><span><strong>{source.name}</strong><small>{source.lastError ? '上次刷新失败' : source.lastFetchedAt ? `更新于 ${new Date(source.lastFetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '尚未刷新'}</small></span></button>
        <button className="source-toggle" aria-label="启用来源" onClick={() => void saveSource({ ...source, enabled: !source.enabled })}><span className={source.enabled ? 'on' : ''} /></button>
        <button className="source-delete" onClick={() => confirm(`删除“${source.name}”及其缓存？`) && void deleteSource(source.id)} aria-label="删除来源"><Trash2 size={14} /></button>
      </article>)}
      {!sources.length && <button className="source-chip add-source" onClick={() => setAdding(true)}><Plus size={18} /> 添加第一条奏报来源</button>}
    </section>
    <section className="paper-panel toolbar news-toolbar">
      <div className="tabs"><button className={sourceFilter === 'all' ? 'active' : ''} onClick={() => setSourceFilter('all')}>全部 <span>{news.length}</span></button><button className={sourceFilter === 'matched' ? 'active' : ''} onClick={() => setSourceFilter('matched')}>与朕相关 <span>{news.filter((item) => item.matchedConcernIds.length).length}</span></button></div>
      <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="检索奏报…" /></label>
    </section>
    <section className="paper-panel news-list-panel">
      {(sourceFilter === 'matched' ? filtered.filter((item) => item.matchedConcernIds.length) : filtered).length ? <div className="news-list">
        {(sourceFilter === 'matched' ? filtered.filter((item) => item.matchedConcernIds.length) : filtered).map((item) => {
          const source = sourceMap.get(item.sourceId)
          return <article className="news-row" key={item.id} onClick={() => void openArticle(item)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && void openArticle(item)}>
            <div className="news-source-mark">{source?.name.slice(0, 1) ?? '报'}</div>
            <div className="news-body"><div className="news-meta"><span>{source?.name ?? '未知来源'}</span>{item.matchedConcernIds.length > 0 && <b>关心相关</b>}<time><Clock3 size={12} />{item.publishedAt ? new Date(item.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '时间未载'}</time></div><h2>{item.title}</h2>{item.summary && <p>{item.summary.replace(/<[^>]+>/g, '').slice(0, 220)}</p>}</div>
            <ExternalLink size={16} />
          </article>
        })}
      </div> : <EmptyState title="暂无奏报" detail="刷新已启用的 RSS 来源，新的消息会缓存在本机。" />}
    </section>
    {sources.some((source) => source.lastError) && <div className="offline-hint"><AlertCircle size={15} /> 部分来源未能刷新，当前仍展示最近一次本地缓存。</div>}
    {adding && <SourceEditor onClose={() => setAdding(false)} onSave={async (source) => { await saveSource(source); setAdding(false) }} />}
  </div>
}

function SourceEditor({ onClose, onSave }: { onClose(): void; onSave(source: ContentSource): Promise<void> }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const valid = /^https:\/\//i.test(url)
  return <Modal title="添加奏报来源" onClose={onClose}>
    <form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!valid || !name.trim()) return; await onSave({ id: newId(), name: name.trim(), kind: 'rss', url: url.trim(), enabled: true, lastFetchedAt: null, lastError: null, createdAt: nowIso() }) }}>
      <label><span>来源名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：行业动态" /></label>
      <label><span>RSS / Atom 地址</span><div className="input-with-icon"><Link2 size={16} /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/feed.xml" /></div><small>为保护本机，首版仅允许公开 HTTPS 地址。</small></label>
      <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!valid || !name.trim()}>收入奏报</button></footer>
    </form>
  </Modal>
}
