import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './presentation/state/AppContext'
import { AppShell } from './presentation/components/AppShell'
import { DashboardPage } from './presentation/pages/DashboardPage'
import { TodosPage } from './presentation/pages/TodosPage'
import { ConcernsPage } from './presentation/pages/ConcernsPage'
import { NewsPage } from './presentation/pages/NewsPage'
import { AssistantPage } from './presentation/pages/AssistantPage'
import { SettingsPage } from './presentation/pages/SettingsPage'
import './App.css'

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="todos" element={<TodosPage />} />
            <Route path="concerns" element={<ConcernsPage />} />
            <Route path="news" element={<NewsPage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}

