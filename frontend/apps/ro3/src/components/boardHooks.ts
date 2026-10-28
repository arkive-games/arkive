import { useLayoutEffect, useRef, useState } from 'react'

/**
 * Points a panel's rounded pointer at the pressed tile inside `area`: from the
 * panel's left edge when it stands beside the board, from its top when it
 * sits below. Written straight to the pointer's style: it follows layout, not
 * state. Page scrolls re-aim it too, for a panel that sticks while the board moves.
 */
export function usePointer(key: string) {
  const panel = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLDivElement>(null)
  const pointer = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = panel.current
    const scope = area.current
    if (!box || !scope) return
    const aim = () => {
      const tile = scope.querySelector<HTMLElement>('[aria-pressed="true"]')
      if (!tile || !pointer.current) return
      const outer = box.getBoundingClientRect()
      const inner = tile.getBoundingClientRect()
      const style = pointer.current.style
      if (outer.left >= inner.right) {
        style.left = '0px'
        style.top = `${Math.max(16, Math.min(outer.height - 16, inner.top + inner.height / 2 - outer.top))}px`
      } else {
        style.left = `${Math.max(16, Math.min(outer.width - 16, inner.left + inner.width / 2 - outer.left))}px`
        style.top = '0px'
      }
    }
    aim()
    const observer = new ResizeObserver(aim)
    observer.observe(box)
    observer.observe(scope)
    scope.addEventListener('scroll', aim, { capture: true, passive: true })
    window.addEventListener('scroll', aim, { passive: true })
    return () => {
      observer.disconnect()
      scope.removeEventListener('scroll', aim, { capture: true })
      window.removeEventListener('scroll', aim)
    }
  }, [key])
  return { panelRef: panel, areaRef: area, pointerRef: pointer }
}

/** How many cells of `cell` rem fit across the measured element; 0 until measured. */
export function useFit(cell: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    // The observer reports once on observe, so this also takes the first measure.
    const observer = new ResizeObserver(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      setFit(Math.max(1, Math.floor(node.clientWidth / (cell * rem))))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [cell])
  return [ref, fit] as const
}
