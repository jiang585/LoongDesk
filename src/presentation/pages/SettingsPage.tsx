import { AlertTriangle, Check, CloudDownload, Database, Download, Eye, EyeOff, KeyRound, LockKeyhole, MonitorUp, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackupInspection, DatabaseDiagnostics } from '../../domain/models'
import { inspectBackup } from '../../application/backupInspection'
import { isTauri } from '../../infrastructure/platform'
import { desktopManager, type DesktopPreferences } from '../../infrastructure/desktopManager'
import { useApp } from '../state/AppContext'
import { Modal } from '../components/Modal'

export function SettingsPage() {
  const { settings, saveSettings, secretStore, exportBackup, importBackup, getDatabaseDiagnostics, clearAllData, setNotice } = useApp()
  const [password, setPassword] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [vaultStatus, setVaultStatus] = useState<'locked' | 'unlocked'>('locked')
  const [busy, setBusy] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [backupPreview, setBackupPreview] = useState<BackupInspection | null>(null)
  const [diagnostics, setDiagnostics] = useState<DatabaseDiagnostics | null>(null)
  const [desktopPreferences, setDesktopPreferences] = useState<DesktopPreferences>({ backgroundResident: false, shortcutsEnabled: false })
  const [updateBusy, setUpdateBusy] = useState(false)

  const runDiagnostics = useCallback(async () => setDiagnostics(await getDatabaseDiagnostics()), [getDatabaseDiagnostics])
  useEffect(() => { void runDiagnostics() }, [runDiagnostics])
  useEffect(() => {
    if (!isTauri()) return
    void desktopManager.preferences()
      .then(setDesktopPreferences)
      .catch((cause) => setNotice(cause instanceof Error ? cause.message : '无法读取桌面设置'))
  }, [setNotice])

  const updateDesktopPreference = async (key: keyof DesktopPreferences, enabled: boolean) => {
    try {
      if (key === 'backgroundResident') await desktopManager.setBackgroundResident(enabled)
      else await desktopManager.setShortcutsEnabled(enabled)
      setDesktopPreferences((current) => ({ ...current, [key]: enabled }))
      setNotice(key === 'backgroundResident' ? (enabled ? '关闭主窗后将驻留系统托盘' : '关闭主窗将完全退出御案') : (enabled ? '全局快捷键已启用' : '全局快捷键已停用'))
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '桌面设置保存失败')
    }
  }

  const checkForUpdate = async () => {
    setUpdateBusy(true)
    try {
      const update = await desktopManager.checkForUpdate()
      if (!update) { setNotice('当前已是最新版本'); return }
      if (!confirm(`发现御案 ${update.version}，是否下载并安装？`)) return
      setNotice('正在下载更新，完成后将自动重启…')
      await desktopManager.installUpdate(update)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '检查更新失败')
    } finally {
      setUpdateBusy(false)
    }
  }

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
      setBackupPreview(await inspectBackup(raw))
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '这不是有效的御案 v1 备份')
    } finally {
      if (importRef.current) importRef.current.value = ''
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
          <label><span>关闭主窗口</span><select disabled={!isTauri()} value={desktopPreferences.backgroundResident ? 'resident' : 'exit'} onChange={(event) => void updateDesktopPreference('backgroundResident', event.target.value === 'resident')}><option value="exit">完全退出御案</option><option value="resident">驻留系统托盘</option></select></label>
          <label><span>全局快捷键</span><select disabled={!isTauri()} value={desktopPreferences.shortcutsEnabled ? 'enabled' : 'disabled'} onChange={(event) => void updateDesktopPreference('shortcutsEnabled', event.target.value === 'enabled')}><option value="enabled">启用 Ctrl+Shift+Space / T</option><option value="disabled">停用</option></select></label>
          <button className="secondary-button" disabled={!isTauri() || updateBusy} onClick={() => void checkForUpdate()}><CloudDownload size={16} /> {updateBusy ? '正在检查…' : '检查应用更新'}</button>
          {!isTauri() && <small className="field-note">浏览器预览不支持托盘、全局快捷键和应用更新。</small>}
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
          <div className={`database-health ${diagnostics?.status ?? 'checking'}`}>
            <div><strong>数据库健康检查</strong><span>{diagnostics ? (diagnostics.status === 'healthy' ? '正常' : diagnostics.status === 'warning' ? '需留意' : '异常') : '检查中'}</span></div>
            {diagnostics && <p>
              {diagnostics.engine === 'sqlite' ? 'SQLite' : '浏览器存储'} · 架构版本 {diagnostics.schemaVersion ?? '未知'} ·
              完整性 {diagnostics.integrityMessage} · 外键异常 {diagnostics.foreignKeyIssues}
            </p>}
            <button className="ghost-button" onClick={() => void runDiagnostics()}><RefreshCw size={14} /> 重新诊断</button>
          </div>
        </div>
      </section>

      <section className="paper-panel settings-card danger-card">
        <header><span className="settings-icon"><AlertTriangle size={19} /></span><div><h2>清空御案</h2><p>删除所有本地业务数据并锁定保险库。</p></div></header>
        <div className="settings-body"><button className="danger-button" onClick={async () => { if (!confirm('此操作无法撤销。确定清空全部本地卷宗？')) return; await clearAllData(); setNotice('御案已清空') }}><Trash2 size={16} /> 清空全部本地数据</button></div>
      </section>
    </div>
    <section className="privacy-manifest"><ShieldCheck size={18} /><div><strong>御案不设账户、云同步、广告或遥测。</strong><p>仅在问答、刷新 RSS/网页快照、主动打开原文或手动检查更新时访问网络。</p></div></section>
    {backupPreview && <Modal title="恢复预览" wide onClose={() => setBackupPreview(null)}>
      <div className="backup-preview">
        <p>备份时间：{new Date(backupPreview.backup.exportedAt).toLocaleString('zh-CN')}</p>
        <p>校验指纹：<code>{backupPreview.fingerprint}</code></p>
        <div className="backup-counts">
          <span>待办 <strong>{backupPreview.counts.todos}</strong></span>
          <span>关心项 <strong>{backupPreview.counts.concerns}</strong></span>
          <span>奏报 <strong>{backupPreview.counts.news}</strong></span>
          <span>会话/消息 <strong>{backupPreview.counts.sessions}/{backupPreview.counts.messages}</strong></span>
          <span>AI 朱批历史 <strong>{backupPreview.counts.proposalHistory}</strong></span>
          <span>筛选器/规则 <strong>{backupPreview.counts.concernFilters}/{backupPreview.counts.concernRules}</strong></span>
        </div>
        {backupPreview.warnings.length > 0 && <div className="backup-warnings"><AlertTriangle size={17} /><div>{backupPreview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
        <p className="privacy-note">恢复会先通过结构和关联校验，确认后以事务替换当前本地数据。此操作不可撤销，建议先导出现有备份。</p>
        <footer className="modal-actions"><button className="secondary-button" onClick={() => setBackupPreview(null)}>取消</button><button className="primary-button" onClick={async () => { setBusy(true); try { await importBackup(backupPreview.backup); setBackupPreview(null); setNotice('卷宗恢复完成') } finally { setBusy(false) } }} disabled={busy}>确认恢复</button></footer>
      </div>
    </Modal>}
  </div>
}
