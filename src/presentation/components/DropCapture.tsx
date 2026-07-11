import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ConcernSourceType } from '../../domain/models'
import { useApp } from '../state/AppContext'
import { isTauri } from '../../infrastructure/platform'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { invoke } from '@tauri-apps/api/core'

const MAX_CAPTURE_BYTES = 1_048_576

function dropText(event: globalThis.DragEvent) {
  const plain = event.dataTransfer?.getData('text/plain').trim()
  if (plain) return plain
  const uri = event.dataTransfer?.getData('text/uri-list').split('\n').find((line) => !line.startsWith('#'))?.trim()
  if (uri) return uri
  const html = event.dataTransfer?.getData('text/html')
  if (!html) return ''
  return new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() ?? ''
}

/** Window-wide, user-initiated drop intake shared by the main desk and Xiao Anzi. */
export function DropCapture({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const { captureConcern, setNotice } = useApp()
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const capture = useCallback(async (text: string, sourceType: ConcernSourceType) => {
    if (!text.trim()) return
    if (new Blob([text]).size > MAX_CAPTURE_BYTES) {
      setNotice('这份内容超过 1MB，未收录')
      return
    }
    try {
      const result = await captureConcern(text, sourceType)
      setNotice(result.duplicate ? `此内容已在关心库：${result.duplicate.title}` : '小安子已收下，归入关心库')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '未能收录拖入内容')
    }
  }, [captureConcern, setNotice])

  const captureFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!/\.(txt|md|markdown)$/i.test(file.name)) {
        setNotice('小安子只接收 .txt 或 .md 文本文件')
        continue
      }
      if (file.size > MAX_CAPTURE_BYTES) {
        setNotice(`${file.name} 超过 1MB，未收录`)
        continue
      }
      await capture(await file.text(), 'file')
    }
  }, [capture, setNotice])

  useEffect(() => {
    const enter = (event: globalThis.DragEvent) => {
      if (!event.dataTransfer?.types.length) return
      event.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const over = (event: globalThis.DragEvent) => event.preventDefault()
    const leave = (event: globalThis.DragEvent) => {
      event.preventDefault()
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setDragging(false)
    }
    const drop = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented) return
      event.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (event.dataTransfer?.files?.length && isTauri()) return
      if (event.dataTransfer?.files?.length) void captureFiles(event.dataTransfer.files)
      else void capture(dropText(event), 'drop')
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
    }
  }, [capture, captureFiles])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== 'drop') return
      void invoke<string[]>('read_dropped_text', { paths: event.payload.paths })
        .then((texts) => Promise.all(texts.map((text) => capture(text, 'file'))))
        .catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : '未能读取拖入文件'))
    }).then((dispose) => { unlisten = dispose })
    return () => unlisten?.()
  }, [capture, setNotice])

  return <div className={compact ? 'drop-capture compact' : 'drop-capture'}>
    {children}
    {dragging && <div className="drop-capture-overlay" role="status"><strong>交给小安子</strong><span>松手即可收进关心库</span></div>}
  </div>
}
