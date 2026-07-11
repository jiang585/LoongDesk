import { ClipboardPaste, LibraryBig, MessageCircle, Minus, Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { LogicalSize } from '@tauri-apps/api/dpi'
import { newId, nowIso } from '../../application/services'
import type { ChatMessage } from '../../domain/models'
import { isTauri } from '../../infrastructure/platform'
import xiaoAnzi from '../../assets/generated/xiao-anzi-v2.png'
import { DropCapture } from '../components/DropCapture'
import { useApp } from '../state/AppContext'

export function PetWindow() {
  const { assistant, secretStore, settings, sessions, messages, saveMessage, captureConcern, createTodo, setNotice } = useApp()
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const requestId = useRef<string | null>(null)
  const answerRef = useRef('')
  const sessionId = sessions.find((session) => session.id === 'pet-session')?.id ?? 'pet-session'
  const history = messages.filter((message) => message.sessionId === sessionId)

  useEffect(() => {
    document.documentElement.classList.add('pet-mode')
    document.body.classList.add('pet-mode')
    return () => { document.documentElement.classList.remove('pet-mode'); document.body.classList.remove('pet-mode') }
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let timer = 0
    let unlisten: (() => void) | undefined
    const saveBounds = async () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        void (async () => {
          const windowHandle = getCurrentWindow()
          const scaleFactor = await windowHandle.scaleFactor()
          const { x, y } = (await windowHandle.outerPosition()).toLogical(scaleFactor)
          // Settings persistence is owned by the main desk; send only a local window event.
          await emitTo('main', 'yuan://pet-bounds', { x, y })
        })()
      }, 250)
    }
    void getCurrentWindow().onMoved(() => void saveBounds()).then((dispose) => { unlisten = dispose })
    return () => { window.clearTimeout(timer); unlisten?.() }
  }, [settings])

  useEffect(() => {
    if (!isTauri()) return
    void getCurrentWindow().setSize(new LogicalSize(expanded ? 360 : 230, expanded ? 560 : 320))
  }, [expanded])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void listen<{ requestId: string; type: 'chunk' | 'done' | 'error'; content?: string }>('yuan://pet-chat-response', ({ payload }) => {
      if (payload.requestId !== requestId.current) return
      if (payload.type === 'chunk') {
        answerRef.current += payload.content ?? ''
        setStreaming(answerRef.current)
      } else if (payload.type === 'done') {
        const answer = answerRef.current
        if (answer.trim()) void saveMessage({ id: newId(), sessionId, role: 'assistant', content: answer, createdAt: nowIso() })
        setStreaming(''); setBusy(false); requestId.current = null
      } else {
        setNotice(payload.content ?? '小安子暂未能应答')
        setStreaming(''); setBusy(false); requestId.current = null
      }
    }).then((dispose) => { unlisten = dispose })
    return () => unlisten?.()
  }, [saveMessage, sessionId, setNotice])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void getCurrentWindow().listen<boolean>('yuan://pet-visibility', ({ payload }) => {
      if (payload) void getCurrentWindow().show()
      else void getCurrentWindow().hide()
    }).then((dispose) => { unlisten = dispose })
    return () => unlisten?.()
  }, [])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput(''); setBusy(true); setStreaming('')
    const userMessage: ChatMessage = { id: newId(), sessionId, role: 'user', content: text, createdAt: nowIso() }
    await saveMessage(userMessage)
    try {
      if (isTauri()) {
        const id = newId(); requestId.current = id; answerRef.current = ''
        await emitTo('main', 'yuan://pet-chat-request', {
          requestId: id,
          text,
          history: history.slice(-12).map((message) => ({ role: message.role, content: message.content })),
        })
        return
      }
      const apiKey = await secretStore.getApiKey()
      if (!apiKey) throw new Error('请先在宫设中解锁保险库并配置 DeepSeek API Key')
      const id = newId(); requestId.current = id
      let answer = ''
      await assistant.chat({
        requestId: id, apiKey, model: settings.model, thinkingEnabled: settings.thinkingEnabled,
        messages: [
          { role: 'system', content: '你是御案中的 AI 小太监小安子。称用户为陛下，回答简洁恭敬。不要声称已改动本地数据；整理或写入必须由界面确认。当前没有附带关心库或待办上下文。' },
          ...history.slice(-12).map((message) => ({ role: message.role, content: message.content } as const)),
          { role: 'user', content: text },
        ],
      }, (chunk) => { answer += chunk; setStreaming(answer) })
      if (answer.trim()) await saveMessage({ id: newId(), sessionId, role: 'assistant', content: answer, createdAt: nowIso() })
      setStreaming('')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '小安子暂未能应答')
      if (isTauri()) { setBusy(false); requestId.current = null }
    } finally {
      if (!isTauri()) { setBusy(false); requestId.current = null }
    }
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const result = await captureConcern(text, 'paste')
      setNotice(result.duplicate ? '此内容已在关心库' : '小安子已收下剪贴板内容')
    } catch { setNotice('无法读取剪贴板，请检查权限') }
  }

  const openDesk = async (route = '/assistant') => {
    if (isTauri()) await emitTo('main', 'yuan://open-route', route)
  }

  return <DropCapture compact>
    <div className={`pet-window ${expanded ? 'expanded' : ''}`}>
      <button className="pet-drag-handle" data-tauri-drag-region aria-label="拖动小安子" />
      <div className="pet-character" onClick={() => setExpanded((value) => !value)} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setExpanded((value) => !value)}>
        <img src={xiaoAnzi} alt="Q版小安子，点击交谈" />
        <span className={busy ? 'thinking' : ''}>{busy ? '思量中' : '小安子'}</span>
      </div>
      {expanded && <section className="pet-bubble">
        <header><div><Sparkles size={15} /><strong>候旨中</strong></div><button onClick={() => setExpanded(false)} aria-label="收起"><Minus size={16} /></button></header>
        <div className="pet-quick-actions">
          <button onClick={() => void paste()}><ClipboardPaste size={14} /> 收下剪贴板</button>
          <button onClick={() => void openDesk('/concerns')}><LibraryBig size={14} /> 关心库</button>
          <button onClick={() => void openDesk('/assistant')}><MessageCircle size={14} /> 完整对话</button>
        </div>
        <div className="pet-chat-history">
          {history.slice(-3).map((message) => <p key={message.id} className={message.role}><b>{message.role === 'assistant' ? '小安子' : '陛下'}：</b>{message.content}</p>)}
          {streaming && <p className="assistant"><b>小安子：</b>{streaming}</p>}
        </div>
        <div className="pet-compose"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void send() }} placeholder="向小安子吩咐…" /><button disabled={!input.trim() || busy} onClick={() => void send()} aria-label="发送"><Send size={16} /></button></div>
        <button className="pet-todo" onClick={() => { const title = input.trim(); if (title) { void createTodo({ title }); setInput(''); setNotice('已记为待办') } }}>将输入记为待办</button>
      </section>}
      <button className="pet-hide" onClick={() => { if (isTauri()) void getCurrentWindow().hide() }} aria-label="暂时隐藏小安子"><X size={14} /></button>
    </div>
  </DropCapture>
}
