import { AlertTriangle, Check, Database, Download, Eye, EyeOff, KeyRound, LockKeyhole, MonitorUp, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import type { AppBackup } from '../../domain/models'
import { backupSchema } from '../../domain/schemas'
import { isTauri } from '../../infrastructure/platform'
import { useApp } from '../state/AppContext'

export function SettingsPage() {
  const { settings, saveSettings, secretStore, exportBackup, importBackup, clearAllData, setNotice } = useApp()
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<'locked' | 'unlocked'>('locked')
  const [busy, setBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const unlock = async () => {
    if (!password) return
    setBusy(true)
    const ok = await secretStore.unlock(password)
    setVaultStatus(ok ? 'unlocked' : 'locked')
    setNotice(ok ? '保险库已解锁' : '密码不正确，或保险库无法打开')
    setBusy(false)
  }

  const saveKey = async () => {
    if (password.length < 8) { setNotice('保险库密码至少需要 8 个字符'); return }
    if (!apiKey.trim()) { setNotice('请输入 DeepSeek API Key'); return }
    setBusy(true)
    try {
      await secretStore.saveApiKey(password, apiKey)
      await saveSettings({ ...settings, vaultConfigured: true })
      setVaultStatus('unlocked'); setApiKey('')
      setNotice('DeepSeek 密钥已加密收入保险库')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '密钥保存失败')
    } finally { setBusy(false) }
  }

  const downloadBackup = async () => {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `御案备份-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('本地备份已经导出；其中不含 API Key')
  }

  const readBackup = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text())
      backupSchema.parse(raw)
      await importBackup(raw as AppBackup)
      setNotice('卷宗恢复完成')
    } catch {
      setNotice('这不是有效的御案 v1 备份')
    }
  }

  return <div className="page settings-page">
    <header className="page-heading"><div><span className="eyebrow">内廷章程</span><h1>宫设</h1><p>管理模型、保险库、刷新节奏与本地卷宗。</p></div></header>
    <div className="settings-grid">
      <section className="paper-panel settings-card">
        <header><span className="settings-icon"><LockKeyhole size={19} /></span><div><h2>DeepSeek 保险库</h2><p>密钥只在本机加密保存，不进入数据库或备份。</p></div><span className={`status-badge ${vaultStatus}`}>{vaultStatus === 'unlocked' ? <><Check size={13} /> 已解锁</> : '未解锁'}</span></header>
        <div className="settings-body">
          <label><span>保险库主密码</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={settings.vaultConfigured ? '输入密码以解锁' : '首次设置，至少 8 个字符'} /></label>
          {settings.vaultConfigured && vaultStatus === 'locked' ? <button className="secondary-button" disabled={busy || !password} onClick={() => void unlock()}><KeyRound size={16} /> 解锁保险库</button> : <>
            <label><span>DeepSeek API Key</span><div className="input-with-action"><input type={showKey ? 'text' : 'password'} autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" /><button onClick={() => setShowKey((value) => !value)} aria-label="显示或隐藏密钥">{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            <button className="primary-button" disabled={busy || password.length < 8 || !apiKey.trim()} onClick={() => void saveKey()}><ShieldCheck size={16} /> {settings.vaultConfigured ? '更换加密密钥' : '建立保险库'}</button>
          </>}
          <small className="field-note">忘记主密码无法恢复其中的 API Key，但不会影响待办和关心库。</small>
        </div>
      </section>

      <section className="paper-panel settings-card">
        <header><span className="settings-icon"><MonitorUp size={19} /></span><div><h2>桌面与小安子</h2><p>调整阅读大小，并管理始终置顶的桌面小安子。</p></div></header>
        <div className="settings-body form-row">
          <label><span>界面字号</span><select value={settings.fontScale} onChange={(event) => void saveSettings({ ...settings, fontScale: Number(event.target.value) as typeof settings.fontScale })}><option value={1}>标准（16px 正文）</option><option value={1.12}>较大（112%）</option><option value={1.25}>大字（125%）</option></select></label>
          <label><span>小安子</span><select value={settings.petEnabled ? 'show' : 'hide'} onChange={(event) => void saveSettings({ ...settings, petEnabled: event.target.value === 'show' })}><option value="show">显示在桌面</option><option value="hide">暂时隐藏</option></select></label>
          <label><span>窗口层级</span><select value={settings.petAlwaysOnTop ? 'top' : 'normal'} onChange={(event) => void saveSettings({ ...settings, petAlwaysOnTop: event.target.value === 'top' })}><option value="top">始终置顶</option><option value="normal">普通窗口</option></select></label>
        </div>
      </section>

      <section className="paper-panel settings-card">
        <header><span className="settings-icon"><RefreshCw size={19} /></span><div><h2>模型与刷新</h2><p>控制问答模型和奏报缓存策略。</p></div></header>
        <div className="settings-body form-row">
          <label><span>默认模型</span><select value={settings.model} onChange={(event) => void saveSettings({ ...settings, model: event.target.value as typeof settings.model, thinkingEnabled: event.target.value === 'deepseek-v4-pro' })}><option value="deepseek-v4-flash">DeepSeek V4 Flash</option><option value="deepseek-v4-pro">DeepSeek V4 Pro</option></select></label>
          <label><span>前台刷新</span><select value={settings.refreshIntervalMinutes} onChange={(event) => void saveSettings({ ...settings, refreshIntervalMinutes: Number(event.target.value) })}><option value={15}>每 15 分钟</option><option value={30}>每 30 分钟</option><option value={60}>每 60 分钟</option></select></label>
          <label><span>新闻缓存</span><select value={settings.cacheRetentionDays} onChange={(event) => void saveSettings({ ...settings, cacheRetentionDays: Number(event.target.value) })}><option value={7}>保留 7 天</option><option value={30}>保留 30 天</option><option value={90}>保留 90 天</option></select></label>
        </div>
      </section>

      <section className="paper-panel settings-card">
        <header><span className="settings-icon"><Database size={19} /></span><div><h2>本地卷宗</h2><p>{isTauri() ? '桌面端数据保存在应用配置目录的 SQLite 中。' : '当前为浏览器预览，数据保存在 localStorage 中。'}</p></div></header>
        <div className="settings-body data-actions">
          <button className="secondary-button" onClick={() => void downloadBackup()}><Download size={16} /> 导出 JSON 备份</button>
          <button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={16} /> 从备份恢复</button>
          <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void readBackup(event.target.files[0])} />
          <p className="privacy-note">备份包含待办、关心库、奏报缓存和聊天记录，不包含保险库密码或 API Key。</p>
        </div>
      </section>

      <section className="paper-panel settings-card danger-card">
        <header><span className="settings-icon"><AlertTriangle size={19} /></span><div><h2>清空御案</h2><p>删除所有本地业务数据并锁定保险库。</p></div></header>
        <div className="settings-body"><button className="danger-button" onClick={async () => { if (!confirm('此操作无法撤销。确定清空全部本地卷宗？')) return; await clearAllData(); setNotice('御案已清空') }}><Trash2 size={16} /> 清空全部本地数据</button></div>
      </section>
    </div>
    <section className="privacy-manifest"><ShieldCheck size={18} /><div><strong>御案不设账户、云同步、广告或遥测。</strong><p>仅在问答、刷新 RSS/网页快照和主动打开原文时访问网络。</p></div></section>
  </div>
}
