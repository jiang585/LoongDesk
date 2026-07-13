import { Archive, CalendarDays, Check, Clock3, Edit3, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Todo, TodoPriority, TodoStatus } from '../../domain/models'
import { useApp } from '../state/AppContext'
import { EmptyState } from '../components/EmptyState'
import { Modal } from '../components/Modal'

const statusTabs: Array<{ value: 'all' | TodoStatus; label: string }> = [
  { value: 'all', label: '全部' }, { value: 'pending', label: '待批' },
  { value: 'done', label: '已办' }, { value: 'snoozed', label: '搁置' },
  { value: 'archived', label: '归档' },
]
const priorityLabel: Record<TodoPriority, string> = { high: '急件', medium: '常件', low: '缓件' }

export function TodosPage() {
  const { todos, createTodo, updateTodo, deleteTodo } = useApp()
  const [status, setStatus] = useState<'all' | TodoStatus>('pending')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Todo | null | 'new'>(null)
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (new URLSearchParams(location.search).get('quick') !== '1') return
    setEditing('new')
    void navigate('/todos', { replace: true })
  }, [location.search, navigate])
  const filtered = useMemo(() => todos.filter((todo) =>
    (status === 'all' || todo.status === status) &&
    `${todo.title} ${todo.details} ${todo.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()),
  ), [search, status, todos])

  return (
    <div className="page">
      <header className="page-heading"><div><span className="eyebrow">御笔朱批</span><h1>待批奏折</h1><p>将事务逐一落笔，办妥之后归入卷宗。</p></div><button className="primary-button" onClick={() => setEditing('new')}><Plus size={17} /> 新拟奏折</button></header>
      <section className="paper-panel toolbar">
        <div className="tabs">{statusTabs.map((tab) => <button key={tab.value} className={status === tab.value ? 'active' : ''} onClick={() => setStatus(tab.value)}>{tab.label}<span>{tab.value === 'all' ? todos.length : todos.filter((todo) => todo.status === tab.value).length}</span></button>)}</div>
        <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="检索奏折…" /></label>
      </section>
      <section className="paper-panel list-panel">
        {filtered.length ? <div className="todo-list">{filtered.map((todo) => (
          <article className={`todo-row ${todo.status === 'done' ? 'completed' : ''}`} key={todo.id}>
            <button className={`todo-check ${todo.status === 'done' ? 'checked' : ''}`} onClick={() => void updateTodo({ ...todo, status: todo.status === 'done' ? 'pending' : 'done' })} aria-label="切换完成状态">{todo.status === 'done' && <Check size={15} />}</button>
            <div className="todo-body"><div className="todo-title-row"><strong>{todo.title}</strong><span className={`priority-pill ${todo.priority}`}>{priorityLabel[todo.priority]}</span></div>{todo.details && <p>{todo.details}</p>}<div className="meta-row"><span><CalendarDays size={13} />{todo.dueAt ? new Date(todo.dueAt).toLocaleDateString('zh-CN') : '无期限'}</span>{todo.tags.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div></div>
            <div className="row-actions">
              <button onClick={() => void updateTodo({ ...todo, status: todo.status === 'snoozed' ? 'pending' : 'snoozed' })} title="搁置"><Clock3 size={16} /></button>
              <button onClick={() => void updateTodo({ ...todo, status: 'archived' })} title="归档"><Archive size={16} /></button>
              <button onClick={() => setEditing(todo)} title="编辑"><Edit3 size={16} /></button>
              <button className="danger" onClick={() => confirm('确定删除这份奏折？') && void deleteTodo(todo.id)} title="删除"><Trash2 size={16} /></button>
            </div>
          </article>
        ))}</div> : <EmptyState title="此卷尚空" detail="换个筛选条件，或拟一份新的奏折。" action={<button className="text-button" onClick={() => setEditing('new')}>新拟奏折</button>} />}
      </section>
      {editing && <TodoEditor todo={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={async (value) => {
        if (editing === 'new') await createTodo(value)
        else await updateTodo({ ...editing, ...value })
        setEditing(null)
      }} />}
    </div>
  )
}

function TodoEditor({ todo, onClose, onSave }: { todo: Todo | null; onClose(): void; onSave(value: Pick<Todo, 'title' | 'details' | 'priority' | 'dueAt' | 'tags'>): Promise<void> }) {
  const [title, setTitle] = useState(todo?.title ?? '')
  const [details, setDetails] = useState(todo?.details ?? '')
  const [priority, setPriority] = useState<TodoPriority>(todo?.priority ?? 'medium')
  const [dueAt, setDueAt] = useState(todo?.dueAt?.slice(0, 10) ?? '')
  const [tags, setTags] = useState(todo?.tags.join('，') ?? '')
  const [busy, setBusy] = useState(false)
  return <Modal title={todo ? '修订奏折' : '新拟奏折'} onClose={onClose}>
    <form className="form-stack" onSubmit={async (event) => { event.preventDefault(); if (!title.trim()) return; setBusy(true); await onSave({ title: title.trim(), details: details.trim(), priority, dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null, tags: tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean) }); setBusy(false) }}>
      <label><span>奏折标题</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="所奏何事" /></label>
      <label><span>详情</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={5} placeholder="将来龙去脉写在这里…" /></label>
      <div className="form-row"><label><span>轻重缓急</span><select value={priority} onChange={(event) => setPriority(event.target.value as TodoPriority)}><option value="high">急件</option><option value="medium">常件</option><option value="low">缓件</option></select></label><label><span>限期</span><input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label></div>
      <label><span>标签</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="工作，生活（逗号分隔）" /></label>
      <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>暂且搁笔</button><button className="primary-button" disabled={busy || !title.trim()}>{busy ? '落笔中…' : '朱批入案'}</button></footer>
    </form>
  </Modal>
}
