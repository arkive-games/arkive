import { useLayoutEffect, type RefObject } from 'react'

/** Apps supply tab-local storage and loading readiness; the shell owns scrolling. */
export interface ContentScrollRestoration {
  key: string
  ready: boolean
  read: () => number
  write: (top: number) => void
}

export function useContentScrollRestoration(
  ref: RefObject<HTMLDivElement | null>,
  memory?: ContentScrollRestoration,
) {
  const key = memory?.key
  const ready = memory?.ready
  const read = memory?.read
  const write = memory?.write
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || key === undefined || !read || !write) return
    let target = 0
    try {
      const value = read()
      if (Number.isFinite(value)) target = Math.max(0, value)
    } catch {
      /* Storage cannot block a page. */
    }
    let restoring = true
    let lastTop = target
    let frame = 0
    const save = () => {
      try {
        write(lastTop)
      } catch {
        /* Restricted storage stays usable. */
      }
    }
    const onScroll = () => {
      if (restoring) return
      lastTop = node.scrollTop
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(save)
    }
    const restore = () => {
      if (!ready || !restoring) return
      node.scrollTop = target
      if (node.scrollHeight - node.clientHeight >= target) {
        restoring = false
        lastTop = node.scrollTop
        observer?.disconnect()
      }
    }
    const interrupt = () => {
      restoring = false
      lastTop = node.scrollTop
      observer?.disconnect()
      save()
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(restore)
    if (node.firstElementChild) observer?.observe(node.firstElementChild)
    node.addEventListener('scroll', onScroll, { passive: true })
    node.addEventListener('wheel', interrupt, { passive: true })
    node.addEventListener('touchstart', interrupt, { passive: true })
    node.addEventListener('pointerdown', interrupt)
    node.addEventListener('keydown', interrupt)
    restore()
    return () => {
      observer?.disconnect()
      cancelAnimationFrame(frame)
      node.removeEventListener('scroll', onScroll)
      node.removeEventListener('wheel', interrupt)
      node.removeEventListener('touchstart', interrupt)
      node.removeEventListener('pointerdown', interrupt)
      node.removeEventListener('keydown', interrupt)
      // Save the last observed position, not a DOM value clamped during unmount.
      if (!restoring) save()
    }
  }, [ref, key, ready, read, write])
}
