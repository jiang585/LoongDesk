import { Archive, ClipboardPaste, Edit3, FileText, Globe2, LibraryBig, Plus, Search, Sparkles, Trash2, UploadCloud } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Concern, ConcernSourceType } from '../../domain/models'
import { useApp } from '../state/AppContext'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'

export function ConcernsPage() {
  const { concerns, captureConcern, updateConcern, deleteConcern, setNotice } = useApp()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState<Concern | null | 'new'>(null)
  const [dragging, setDragging] = useState(false)
  const [duplicate, setDuplicate] = useState<Concern | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const active = useMemo(() => concerns.filter((concern) => concern.status === 'active' && `${concern.title} ${concern.summary} ${concern.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase())), [concerns, search])

  useEffect(() => {
    if (params.get('capture') === '1') {
      setEditor('new')
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const capture = async (text: string, type: ConcernSourceType) => {
    try {
      const result = await captureConcern(text, type)
      if (result.duplicate) setDuplicate(result.duplicate)
      else setNotice('已收入关心库')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '未能收录这段内容')
    }
  }

  const readFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!/\.(txt|md|markdown)$/i.test(file.name)) { setNotice('目前只接收 .txt 与 .md 文本卷宗'); continue }
      if (file.size > 1_048_576) { setNotice(`${file.name} 超过 1MB，未收入`); continue }
      await capture(await file.text(), 'file')
    }
  }

  const onDrop = async (event: DragEvent) => {
    event.preventDefault(); setDragging(false)
    if (event.dataTransfer.files.length) await readFiles(event.dataTransfer.files)
    else {
      const text = event.dataTransfer.getData('text/plain')
      if (text) await capture(text, 'drop')
    }
  }

  return (
    <div className="page">
      <header className="page-heading"><div><span className="eyebrow">留心世事</span><h1>关心库</h1><p>把值得持续关注的文字和链接呈到案前。</p></div><button className="primary-button" onClick={() => setEditor('new')}><Plus size={17} /> 手工呈上</button></header>
      <section className={`capture-zone ${dragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false) }} onDrop={(event) => void onDrop(event)}>
        <span className="capture-icon"><UploadCloud size={25} /></span>
        <div><strong>{dragging ? '松手即可呈上' : '拖入文字或卷宗'}</strong><p>支持网页选中文字，以及不超过 1MB 的 .txt / .md 文件</p></div>
        <div className="capture-actions">
          <button className="secondary-button" onClick={async () => {
            try { await capture(await navigator.clipboard.readText(), 'paste') }
            catch { setNotice('无法读取剪贴板，请检查系统权限') }
          }}><ClipboardPaste size={16} /> 粘贴收录</button>
          <button className="secondary-button" onClick={() => fileRef.current?.click()}><FileText size={16} /> 选择文件</button>
          <input ref={fileRef} hidden type="file" accept=".txt,.md,.markdown,text/plain,text/markdown" multiple onChange={(event) => event.target.files && void readFiles(event.target.files)} />
        </div>
      </section>
      <section className="paper-panel toolbar concern-toolbar">
        <div className="library-count"><LibraryBig size={17} /><span><strong>{active.length}</strong> 件正在关心</span></div>
        <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="检索关心之事…" /></label>
      </section>
      <section className="concern-grid">
        {active.length ? active.map((concern) => <article className="paper-panel concern-card" key={concern.id}>
          <header><span className={`source-badge ${concern.sourceType}`}>{concern.sourceType === 'url' ? <Globe2 size={13} /> : <FileText size={13} />}{sourceLabel(concern.sourceType)}</span><div className="row-actions"><button onClick={() => setEditor(concern)} title="编辑"><Edit3 size={15} /></button><button onClick={() => void updateConcern({ ...concern, status: 'archived' })} title="归档"><Archive size={15} /></button><button className="danger" onClick={() => confirm('确定删除这件关心之事？') && void deleteConcern(concern.id)} title="删除"><Trash2 size={15} /></button></div></header>
          <h2>{concern.title}</h2><p>{concern.summary || concern.rawText.slice(0, 160)}</p>
          <footer><div className="tag-list">{concern.tags.length ? concern.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>) : <span className="muted">尚未加签</span>}</div><time>{new Date(concern.updatedAt).toLocaleDateString('zh-CN')}</time></footer>
        </article>) : <div className="paper-panel concern-empty"><EmptyState title="尚无挂念" detail="拖入文字、粘贴链接，或手工呈上一件值得关注的事。" /></div>}
      </section>
      {editor && <ConcernEditor concern={editor === 'new' ? null : editor} onClose={() => setEditor(null)} onSave={async (value) => {
        if (editor === 'new') await capture(value.rawText, 'manual')
        else await updateConcern({ ...editor, ...value })
        setEditor(null)
      }} />}
      {duplicate && <Modal title="此事似曾呈过" onClose={() => setDuplicate(null)}><div className="duplicate-box"><Sparkles /><p>关心库中已有完全相同的内容：</p><strong>{duplicate.title}</strong><div className="modal-actions"><button className="primary-button" onClick={() => { setEditor(duplicate); setDuplicate(null) }}>打开旧卷</button><button className="secondary-button" onClick={() => setDuplicate(null)}>知道了</button></div></div></Modal>}
    </div>
  )
}

const sourceLabel = (type: ConcernSourceType) => ({ manual: '手书', paste: '粘贴', drop: '拖入', file: '卷宗', url: '网页' })[type]

function ConcernEditor({ concern, onClose, onSave }: { concern: Concern | null; onClose(): void; onSave(value: Pick<Concern, 'title' | 'rawText' | 'summary' | 'tags'>): Promise<void> }) {
  const [title, setTitle] = useState(concern?.title ?? '')
  const [rawText, setRawText] = useState(concern?.rawText ?? '')
  const [summary, setSummary] = useState(concern?.summary ?? '')
  const [tags, setTags] = useState(concern?.tags.join('，') ?? '')
  return <Modal title={concern ? '修订关心之事' : '呈上关心之事'} onClose={onClose} wide>
    <form className="form-stack" onSubmit={async (event) => { event.preventDefault(); const text = rawText.trim(); if (!text) return; await onSave({ title: title.trim() || text.slice(0, 56), rawText: text, summary: summary.trim() || text.replace(/\s+/g, ' ').slice(0, 180), tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) }) }}>
      {concern && <label><span>标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>}
      <label><span>原文或 HTTPS 链接</span><textarea autoFocus={!concern} rows={8} value={rawText} onChange={(event) => setRawText(event.target.value)} placeholder="粘贴值得持续关注的文字；若只粘贴 HTTPS 链接，御案会获取标题与摘要。" /></label>
      {concern && <label><span>摘要</span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>}
      {concern && <label><span>标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="科技，行业，人物" /></label>}
      <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!rawText.trim()}>收入关心库</button></footer>
    </form>
  </Modal>
}

