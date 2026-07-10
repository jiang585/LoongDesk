import { Channel, invoke } from '@tauri-apps/api/core'
import type { AiProposal } from '../domain/models'
import { aiProposalSchema } from '../domain/schemas'
import type { AssistantProvider, AssistantRequest } from '../domain/ports'
import { isTauri } from './platform'

type StreamEvent =
  | { event: 'chunk'; data: { content: string } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } }

export class DeepSeekAssistantProvider implements AssistantProvider {
  async chat(request: AssistantRequest, onChunk: (chunk: string) => void) {
    if (!isTauri()) {
      const demo = '奴才在浏览器预览模式中，未连接 DeepSeek。请运行桌面端并在设置中解锁保险库。'
      for (const part of demo.match(/.{1,10}/g) ?? []) {
        onChunk(part)
        await new Promise((resolve) => setTimeout(resolve, 35))
      }
      return
    }
    const onEvent = new Channel<StreamEvent>()
    let remoteError: Error | null = null
    onEvent.onmessage = (message) => {
      if (message.event === 'chunk') onChunk(message.data.content)
      if (message.event === 'error') remoteError = new Error(message.data.message)
    }
    await invoke('deepseek_stream', { request, onEvent })
    if (remoteError) throw remoteError
  }

  async cancel(requestId: string) {
    if (isTauri()) await invoke('cancel_deepseek', { requestId })
  }

  async organize(request: AssistantRequest): Promise<AiProposal> {
    if (!isTauri()) {
      return { overview: '预览模式示例：整理建议不会自动写入。', concernUpdates: [], todoSuggestions: [] }
    }
    const raw = await invoke<unknown>('deepseek_json', { request })
    return aiProposalSchema.parse(raw)
  }
}
