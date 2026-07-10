import {
  Bot, CheckSquare2, CircleAlert, Feather, LibraryBig, Newspaper,
  PanelLeftClose, PanelLeftOpen, Settings, Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { Onboarding } from './Onboarding'

const navigation = [
  { to: '/', end: true, label: '今日御览', icon: Sparkles },
  { to: '/todos', label: '待批奏折', icon: CheckSquare2 },
  { to: '/concerns', label: '关心库', icon: LibraryBig },
  { to: '/news', label: '今日奏报', icon: Newspaper },
  { to: '/assistant', label: '小太监', icon: Bot },
  { to: '/settings', label: '宫设', icon: Settings },
]

export function AppShell() {
  const { loading, error, notice, setNotice, settings } = useApp()
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        navigate('/concerns?capture=1')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 3200)
    return () => window.clearTimeout(timer)
  }, [notice, setNotice])

  if (loading) return <div className="loading-screen"><span className="loading-seal"><Feather /></span><p>正在展卷…</p></div>
  if (error) return <div className="fatal-screen"><CircleAlert /><h1>御案暂未启封</h1><p>{error}</p></div>

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-seal"><Feather size={22} /></span>
          <div><strong>御案</strong><small>YÙ ÀN</small></div>
        </div>
        <nav aria-label="主导航">
          {navigation.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end} title={label} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon size={19} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="local-badge"><span />本地存卷</div>
          <button className="collapse-button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? '展开侧栏' : '收起侧栏'}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>收起侧栏</span>
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div><span className="topbar-route">{navigation.find((item) => item.to === location.pathname)?.label ?? '御案'}</span></div>
          <time>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</time>
        </header>
        <div className="page-scroll"><Outlet /></div>
      </main>
      {!settings.onboardingComplete && <Onboarding />}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  )
}

