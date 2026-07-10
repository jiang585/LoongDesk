import { invoke } from '@tauri-apps/api/core'
import type { ContentProvider, FeedResult, WebSnapshot } from '../domain/ports'
import { isTauri } from './platform'

export class TauriContentProvider implements ContentProvider {
  async fetchFeed(url: string): Promise<FeedResult> {
    if (!isTauri()) throw new Error('浏览器预览模式不能访问外部订阅源，请在御案桌面端中刷新。')
    return invoke<FeedResult>('fetch_feed', { url })
  }

  async fetchWebSnapshot(url: string): Promise<WebSnapshot> {
    if (!isTauri()) {
      return { title: new URL(url).hostname, summary: '浏览器预览模式未抓取网页正文。', url }
    }
    return invoke<WebSnapshot>('fetch_web_snapshot', { url })
  }
}

