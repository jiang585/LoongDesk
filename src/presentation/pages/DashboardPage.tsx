import { ArrowRight, Bot, Check, Circle, Clock3, LibraryBig, Newspaper, RefreshCw } from 'lucide-react'
import { Link } from 'react-router-dom'
import imperialDesk from '../../assets/generated/imperial-desk.png'
import { useApp } from '../state/AppContext'
import { EmptyState } from '../components/EmptyState'

const priorityLabel = { high: '急', medium: '常', low: '缓' }

export function DashboardPage() {
  const { todos, concerns, news, sources, refreshNews, updateTodo } = useApp()
  const pending = todos.filter((todo) => todo.status === 'pending').slice(0, 4)
  const activeConcerns = concerns.filter((concern) => concern.status === 'active')
  const matchedNews = news.filter((item) => item.matchedConcernIds.length > 0)
  const latestNews = (matchedNews.length ? matchedNews : news).slice(0, 4)
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]))

  return (
    <div className="page dashboard-page">
      <section className="hero-card" style={{ backgroundImage: `linear-gradient(90deg, rgba(34,21,14,.76), rgba(34,21,14,.18)), url(${imperialDesk})` }}>
        <div className="hero-copy">
          <span className="eyebrow light">今日御览</span>
          <h1>陛下，案上诸事<br />已为您铺陈妥当。</h1>
          <p>{pending.length} 份奏折待批，{activeConcerns.length} 件关心之事正在留意。</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/concerns?capture=1">呈上新事</Link>
            <Link className="ghost-button light-button" to="/assistant">召见小安子</Link>
          </div>
        </div>
        <Link to="/assistant" className="attendant-orb" aria-label="打开小太监">
          <img src={imperialDesk} alt="小太监小安子的绘制肖像" />
          <span><Bot size={14} /> 小安子候旨</span>
        </Link>
      </section>

      <section className="metric-row" aria-label="御案概览">
        <Link to="/todos" className="metric-card"><span className="metric-icon red"><Circle size={18} /></span><div><small>待批奏折</small><strong>{pending.length}</strong></div><ArrowRight size={16} /></Link>
        <Link to="/concerns" className="metric-card"><span className="metric-icon gold"><LibraryBig size={18} /></span><div><small>关心之事</small><strong>{activeConcerns.length}</strong></div><ArrowRight size={16} /></Link>
        <Link to="/news" className="metric-card"><span className="metric-icon ink"><Newspaper size={18} /></span><div><small>今日奏报</small><strong>{news.length}</strong></div><ArrowRight size={16} /></Link>
      </section>

      <div className="dashboard-grid">
        <section className="paper-panel section-card">
          <header className="section-heading"><div><span className="eyebrow">案上急务</span><h2>待批奏折</h2></div><Link to="/todos">查看全部 <ArrowRight size={15} /></Link></header>
          {pending.length ? <div className="compact-list">
            {pending.map((todo) => (
              <div className="compact-todo" key={todo.id}>
                <button className="todo-check" onClick={() => void updateTodo({ ...todo, status: 'done' })} aria-label={`完成 ${todo.title}`}><Check size={14} /></button>
                <div><strong>{todo.title}</strong><span><b className={`priority-${todo.priority}`}>{priorityLabel[todo.priority]}</b>{todo.dueAt ? `限期 ${new Date(todo.dueAt).toLocaleDateString('zh-CN')}` : '未设限期'}</span></div>
              </div>
            ))}
          </div> : <EmptyState title="案上清宁" detail="今日尚无待批奏折。" action={<Link className="text-button" to="/todos">拟一份奏折</Link>} />}
        </section>

        <section className="paper-panel section-card news-preview">
          <header className="section-heading"><div><span className="eyebrow">四方来报</span><h2>今日奏报</h2></div><button className="icon-text-button" onClick={() => void refreshNews()}><RefreshCw size={14} /> 刷新</button></header>
          {latestNews.length ? <div className="news-mini-list">
            {latestNews.map((item) => (
              <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                <span>{sourceNames.get(item.sourceId) ?? '奏报'}</span>
                <strong>{item.title}</strong>
                <small><Clock3 size={12} /> {item.publishedAt ? new Date(item.publishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '时间未载'}</small>
              </a>
            ))}
          </div> : <EmptyState title="驿骑未至" detail="刷新奏报，或先在宫设中添加 RSS 来源。" />}
        </section>
      </div>
    </div>
  )
}

