import { HashRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { emitTo, listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { AppProvider } from './presentation/state/AppContext'
import { AppShell } from './presentation/components/AppShell'
import { DashboardPage } from './presentation/pages/DashboardPage'
import { TodosPage } from './presentation/pages/TodosPage'
import { ConcernsPage } from './presentation/pages/ConcernsPage'
import { NewsPage } from './presentation/pages/NewsPage'
import { AssistantPage } from './presentation/pages/AssistantPage'
import { SettingsPage } from './presentation/pages/SettingsPage'
import { PetWindow } from './presentation/pages/PetWindow'
import { DropCapture } from './presentation/components/DropCapture'
import { useApp } from './presentation/state/AppContext'
import { isTauri } from './infrastructure/platform'
import './App.css'

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <WindowRouter />
      </HashRouter>
    </AppProvider>
  )
}

function WindowRouter() {
  const isPet = useMemo(() => isTauri() && getCurrentWindow().label === 'pet', [])
  return isPet ? <PetWindow /> : <MainDesk />
}

function MainDesk() {
  const { settings, saveSettings, assistant, secretStore } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(settings.fontScale))
  }, [settings.fontScale])

  useEffect(() => {
    if (!isTauri()) return
    void (async () => {
      const pet = await WebviewWindow.getByLabel('pet')
      if (!pet) return
      await pet.setAlwaysOnTop(settings.petAlwaysOnTop)
      if (settings.petEnabled) await pet.show()
      else await pet.hide()
    })()
  }, [settings.petAlwaysOnTop, settings.petEnabled])

  useEffect(() => {
    if (!isTauri()) return
    let closeRoute: (() => void) | undefined
    let closeBounds: (() => void) | undefined
    void listen<string>('yuan://open-route', ({ payload }) => navigate(payload)).then((unlisten) => { closeRoute = unlisten })
    void listen<{ x: number; y: number }>('yuan://pet-bounds', ({ payload }) => {
      void saveSettings({ ...settings, petBounds: { x: payload.x, y: payload.y } })
    }).then((unlisten) => { closeBounds = unlisten })
    return () => { closeRoute?.(); closeBounds?.() }
  }, [navigate, saveSettings, settings])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void listen<{ requestId: string; text: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }>('yuan://pet-chat-request', async ({ payload }) => {
      try {
        const apiKey = await secretStore.getApiKey()
        if (!apiKey) throw new Error('请先在宫设中解锁保险库并配置 DeepSeek API Key')
        await assistant.chat({
          requestId: payload.requestId,
          apiKey,
          model: settings.model,
          thinkingEnabled: settings.thinkingEnabled,
          messages: [
            { role: 'system', content: '你是御案中的 AI 小太监小安子。称用户为陛下，回答简洁恭敬。不要声称已修改本地数据；当前请求没有附带关心库或待办上下文。' },
            ...payload.history.slice(-12),
            { role: 'user', content: payload.text },
          ],
        }, (chunk) => void emitTo('pet', 'yuan://pet-chat-response', { requestId: payload.requestId, type: 'chunk', content: chunk }))
        await emitTo('pet', 'yuan://pet-chat-response', { requestId: payload.requestId, type: 'done' })
      } catch (cause) {
        await emitTo('pet', 'yuan://pet-chat-response', { requestId: payload.requestId, type: 'error', content: cause instanceof Error ? cause.message : '小安子暂未能应答' })
      }
    }).then((dispose) => { unlisten = dispose })
    return () => unlisten?.()
  }, [assistant, secretStore, settings.model, settings.thinkingEnabled])

  return <DropCapture><Routes>
    <Route element={<AppShell />}>
      <Route index element={<DashboardPage />} />
      <Route path="todos" element={<TodosPage />} />
      <Route path="concerns" element={<ConcernsPage />} />
      <Route path="news" element={<NewsPage />} />
      <Route path="assistant" element={<AssistantPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></DropCapture>
}
