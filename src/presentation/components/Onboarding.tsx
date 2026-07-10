import { useState } from 'react'
import { Check, Feather, LockKeyhole, Newspaper } from 'lucide-react'
import { useApp } from '../state/AppContext'

export function Onboarding() {
  const { completeOnboarding } = useApp()
  const [addSources, setAddSources] = useState(true)
  const [busy, setBusy] = useState(false)

  return (
    <div className="onboarding-backdrop">
      <section className="onboarding paper-panel">
        <span className="brand-seal"><Feather size={30} /></span>
        <p className="eyebrow">初次开案</p>
        <h1>御案</h1>
        <p className="onboarding-lead">将纷杂消息呈成奏折，把真正重要的事留在案前。</p>
        <div className="onboarding-grid">
          <div><LockKeyhole size={20} /><strong>资料只在本地</strong><span>待办、关心库与问答记录不会上传云端。</span></div>
          <div><Newspaper size={20} /><strong>奏报可自由订阅</strong><span>仅在刷新时访问你启用的 RSS 来源。</span></div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={addSources} onChange={(event) => setAddSources(event.target.checked)} />
          <span><strong>加入三条公开示例奏报源</strong><small>中新网即时、财经与国际，可随时删除。</small></span>
          {addSources && <Check size={18} />}
        </label>
        <button className="primary-button full-button" disabled={busy} onClick={async () => {
          setBusy(true)
          await completeOnboarding(addSources)
          setBusy(false)
        }}>{busy ? '正在开案…' : '启用御案'}</button>
        <p className="privacy-note">DeepSeek 密钥稍后在“宫设”中配置，并由加密保险库保管。</p>
      </section>
    </div>
  )
}

