import { useLayoutEffect, useRef, useState } from 'react'

/** Keeps a streaming chat pinned only while the reader remains near the bottom. */
export function useChatAutoScroll(revision: string | number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const autoFollowRef = useRef(true)
  const [following, setFollowing] = useState(true)

  const scrollToLatest = (behavior: ScrollBehavior = 'smooth') => {
    autoFollowRef.current = true
    setFollowing(true)
    window.requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior, block: 'end' }))
  }

  useLayoutEffect(() => {
    if (!autoFollowRef.current) return
    const element = containerRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [revision])

  const handleScroll = () => {
    const element = containerRef.current
    if (!element) return
    const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 64
    autoFollowRef.current = nearBottom
    setFollowing(nearBottom)
  }

  return { containerRef, endRef, following, handleScroll, scrollToLatest }
}
