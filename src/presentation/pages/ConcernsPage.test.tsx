import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Concern } from '../../domain/models'
import { ConcernsPage } from './ConcernsPage'

const first: Concern = {
  id: 'a', title: '人工智能观察', rawText: '正文中独有关键词：星河模型', summary: '行业摘要',
  sourceType: 'manual', sourceUrl: null, tags: [], status: 'active', contentHash: 'a',
  createdAt: '2026-01-01', updatedAt: '2026-01-01', lastCheckedAt: null,
}
const second: Concern = { ...first, id: 'b', title: '财经观察', rawText: '利率变化', contentHash: 'b' }
const saveSettings = vi.fn().mockResolvedValue(undefined)
const updateConcern = vi.fn().mockResolvedValue(undefined)

vi.mock('../state/AppContext', () => ({
  useApp: () => ({
    concerns: [first, second], captureConcern: vi.fn(), updateConcern, deleteConcern: vi.fn(), createTodo: vi.fn(),
    settings: DEFAULT_SETTINGS, saveSettings, setNotice: vi.fn(),
  }),
}))

describe('ConcernsPage v0.3 workflow', () => {
  beforeEach(() => { saveSettings.mockClear(); updateConcern.mockClear() })

  it('searches raw text, saves the filter, and batch archives the result', async () => {
    render(<MemoryRouter><ConcernsPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/全文检索/), { target: { value: '星河模型' } })
    expect(screen.getByText('人工智能观察')).toBeInTheDocument()
    expect(screen.queryByText('财经观察')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /筛选/ }))
    fireEvent.change(screen.getByPlaceholderText('筛选器名称'), { target: { value: '模型追踪' } })
    fireEvent.click(screen.getByRole('button', { name: /保存当前筛选/ }))
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      concernFilters: [expect.objectContaining({ name: '模型追踪', query: '星河模型' })],
    })))

    fireEvent.click(screen.getByRole('button', { name: /全选/ }))
    fireEvent.click(screen.getAllByRole('button', { name: '归档' })[0])
    await waitFor(() => expect(updateConcern).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', status: 'archived' })))
    expect(updateConcern).toHaveBeenCalledTimes(1)
  })
})
