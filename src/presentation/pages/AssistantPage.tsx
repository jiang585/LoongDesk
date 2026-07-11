import { Bot, Check, ChevronDown, CircleStop, Feather, KeyRound, Send, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { contextPreview, newId, nowIso } from '../../application/services'
import type { AiProposal, ChatMessage } from '../../domain/models'
import type { AssistantRequest } from '../../domain/ports'
import xiaoAnzi from '../../assets/generated/xiao-anzi-v2.png'
import { useApp } from '../state/AppContext'
import { Modal } from '../components/Modal'

type ContextKind = 'concerns' | 'todos' | 'news'

export function AssistantPage() {
  const {
    assistant, secretStore, settings, saveSettings, todos, concerns, news,
    sessions, messages, saveMessage, applyProposal, setNotice,
  } = useApp()
  const [input, setInput] = useState('')
  const [contextKind, setContextKind] = useState<ContextKind>('concerns')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<AiProposal | null>(null)
  const requestRef = useRef<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)
  const sessionId = sessions[0]?.id ?? 'main-session'
  const sessionMessages = messages.filter((message) => message.sessionId === sessionId)

  const scrollToLatest = () => {
    const element = messagesRef.current
    if (!element) return
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    setFollowing(true)
  }

  useEffect(() => {
    if (following) scrollToLatest()
  }, [following, sessionMessages.length, streaming])

  const context = useMemo(() => {
    if (contextKind === 'todos') return contextPreview(todos.filter((item) => item.status === 'pending'), (item) => JSON.stringify(item))
    if (contextKind === 'news') return contextPreview(news.slice(0, 50), (item) => JSON.stringify(item))
    return contextPreview(concerns.filter((item) => item.status === 'active'), (item) => JSON.stringify(item))
  }, [concerns, contextKind, news, todos])

  const contextText = useMemo(() => JSON.stringify(context.items.map((item) => {
    if ('rawText' in item) return { id: item.id, title: item.title, summary: item.summary, tags: item.tags }
    if ('details' in item) return { id: item.id, title: item.title, details: item.details, priority: item.priority, dueAt: item.dueAt }
    return { id: item.id, title: item.title, summary: item.summary, publishedAt: item.publishedAt }
  })), [context.items])

  const buildRequest = async (userText: string): Promise<AssistantRequest> => {
    const apiKey = await secretStore.getApiKey()
    if (!apiKey) throw new Error('保险库尚未解锁，请先到宫设中解锁或保存 DeepSeek API Key。')
    const requestId = newId()
    requestRef.current = requestId
    return {
      requestId, apiKey, model: settings.model, thinkingEnabled: settings.thinkingEnabled,
      messages: [
        { role: 'system', content: `你是“御案”中的 AI 小太监小安子。称用户为陛下，语言恭敬、简洁、可靠，不夸张奉承。你只能依据用户问题与本次随奏上下文回答；不声称已修改本地数据。本次上下文类型：${contextKind}，内容：${contextText}` },
        ...sessionMessages.slice(-20).map((message) => ({ role: message.role, content: message.content } as const)),
        { role: 'user', content: userText },
      ],
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput(''); setBusy(true); setStreaming('')
    const createdAt = nowIso()
    const userMessage: ChatMessage = { id: newId(), sessionId, role: 'user', content: text, createdAt }
    await saveMessage(userMessage)
    try {
      const request = await buildRequest(text)
      let answer = ''
      await assistant.chat(request, (chunk) => { answer += chunk; setStreaming(answer) })
      if (answer.trim()) await saveMessage({ id: newId(), sessionId, role: 'assistant', content: answer, createdAt: nowIso() })
      setStreaming('')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '小安子未能应答')
    } finally {
      setBusy(false); requestRef.current = null
    }
  }

  const organize = async () => {
    if (contextKind !== 'concerns' || !context.items.length) { setNotice('请先选择“关心库”上下文'); return }
    setBusy(true)
    try {
      const request = await buildRequest('整理本次关心库上下文。必须输出 JSON 对象：{"overview":"一句总览","concernUpdates":[{"id":"原始ID","title":"可选精炼标题","summary":"简洁摘要","tags":["标签"]}],"todoSuggestions":[{"title":"可执行事项","details":"说明","priority":"low|medium|high"}]}。不要输出 JSON 之外的文字，不得捏造不存在的 ID。')
      setProposal(await assistant.organize(request))
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '整理失败')
    } finally { setBusy(false) }
  }

  return <div className="page assistant-page">
    <header className="page-heading assistant-heading"><div><span className="eyebrow">御前听差</span><h1>小太监</h1><p>小安子是 AI 助手；只有本次随奏内容会被发往 DeepSeek。</p></div><div className="model-switch"><button className={settings.model === 'deepseek-v4-flash' ? 'active' : ''} onClick={() => void saveSettings({ ...settings, model: 'deepseek-v4-flash', thinkingEnabled: false })}>Flash</button><button className={settings.model === 'deepseek-v4-pro' ? 'active' : ''} onClick={() => void saveSettings({ ...settings, model: 'deepseek-v4-pro', thinkingEnabled: true })}>Pro 深思</button></div></header>
    <div className="assistant-layout">
      <aside className="paper-panel attendant-panel">
        <div className="attendant-portrait"><img src={xiaoAnzi} alt="小安子的 Q 版立绘" /></div>
        <h2>小安子</h2><p>“奴才候旨。可替陛下梳理关心之事，也可将纷乱念头收束成待办。”</p>
        <div className="context-card"><span><Feather size={15} /> 本次随奏</span><label><select value={contextKind} onChange={(event) => setContextKind(event.target.value as ContextKind)}><option value="concerns">关心库</option><option value="todos">待批奏折</option><option value="news">今日奏报</option></select><ChevronDown size={14} /></label><strong>{context.items.length} 条 · {context.textLength.toLocaleString()} 字</strong><small>最多 50 条、20,000 字，不会发送完整资料库。</small></div>
        <button className="secondary-button full-button" disabled={busy} onClick={() => void organize()}><WandSparkles size={16} /> 整理关心库</button>
      </aside>
      <section className="paper-panel chat-panel">
        <div className="chat-messages" ref={messagesRef} onScroll={(event) => {
          const element = event.currentTarget
          setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 72)
        }}>
          {!sessionMessages.length && !streaming && <div className="chat-welcome"><span><Bot size={24} /></span><h2>陛下今日想问何事？</h2><p>试试：“把本次关心库归成三类”或“从今日奏报中找出与我相关的事”。</p><div><button onClick={() => setInput('概括本次随奏中最值得关注的三件事')}>概括三件要事</button><button onClick={() => setInput('把当前事项按轻重缓急排列')}>排列轻重缓急</button></div></div>}
          {sessionMessages.map((message) => <div className={`message ${message.role}`} key={message.id}>{message.role === 'assistant' && <span className="message-avatar"><Bot size={15} /></span>}<div><small>{message.role === 'assistant' ? '小安子' : '陛下'}</small><p>{message.content}</p></div></div>)}
          {streaming && <div className="message assistant"><span className="message-avatar"><Bot size={15} /></span><div><small>小安子</small><p>{streaming}<i className="typing-caret" /></p></div></div>}
        </div>
        {!following && <button className="new-message-button" onClick={scrollToLatest}>回到底部查看新消息</button>}
        <div className="chat-compose">
          <div className="context-disclosure"><KeyRound size={13} /> 将发送当前“{contextKind === 'concerns' ? '关心库' : contextKind === 'todos' ? '待批奏折' : '今日奏报'}”可见上下文 {context.items.length} 条</div>
          <div className="compose-row"><textarea rows={2} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="向小安子下旨…" />{busy ? <button className="stop-button" aria-label="停止生成" onClick={() => { if (requestRef.current) void assistant.cancel(requestRef.current) }}><CircleStop /></button> : <button className="send-button" disabled={!input.trim()} onClick={() => void send()} aria-label="发送"><Send size={18} /></button>}</div>
        </div>
      </section>
    </div>
    {proposal && <ProposalPreview proposal={proposal} onClose={() => setProposal(null)} onApply={async () => { await applyProposal(proposal); setProposal(null) }} />}
  </div>
}

function ProposalPreview({ proposal, onClose, onApply }: { proposal: AiProposal; onClose(): void; onApply(): Promise<void> }) {
  return <Modal title="候旨：整理预览" onClose={onClose} wide><div className="proposal-preview"><div className="proposal-overview"><Sparkles size={19} /><p>{proposal.overview}</p></div><section><h3>关心库修订 <span>{proposal.concernUpdates.length}</span></h3>{proposal.concernUpdates.map((item) => <div className="proposal-row" key={item.id}><Check size={15} /><div><strong>{item.title ?? `条目 ${item.id.slice(0, 8)}`}</strong>{item.summary && <p>{item.summary}</p>}<div className="tag-list">{item.tags?.map((tag) => <span className="tag" key={tag}>#{tag}</span>)}</div></div></div>)}</section><section><h3>新拟待办 <span>{proposal.todoSuggestions.length}</span></h3>{proposal.todoSuggestions.map((item, index) => <div className="proposal-row" key={`${item.title}-${index}`}><Check size={15} /><div><strong>{item.title}</strong>{item.details && <p>{item.details}</p>}</div></div>)}</section><p className="privacy-note">尚未写入任何数据。确认后才会在一个本地操作中落案。</p><footer className="modal-actions"><button className="secondary-button" onClick={onClose}>驳回</button><button className="primary-button" onClick={() => void onApply()}>确认朱批</button></footer></div></Modal>
}
