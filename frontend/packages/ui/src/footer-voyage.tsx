import * as React from "react"
import { createPortal } from "react-dom"

/** Follow the page's actual scroll owner, including the shared content shell. */
export function FooterVoyage({ footerRef }: { footerRef: React.RefObject<HTMLElement | null> }) {
  const layerRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])
  React.useEffect(() => {
    const footer = footerRef.current
    const layer = layerRef.current
    if (!footer || !layer || typeof window.matchMedia !== 'function' || typeof ResizeObserver === 'undefined') return
    const scroller = footer.closest<HTMLElement>('[data-content-scroll]')
    const owner = scroller ?? window
    const desktop = window.matchMedia('(min-width: 768px)')
    let frame = 0
    const draw = () => {
      frame = 0
      if (!desktop.matches) { layer.hidden = true; return }
      layer.hidden = false
      const bounds = scroller?.getBoundingClientRect()
      const left = bounds?.left ?? 0
      const width = scroller?.clientWidth ?? document.documentElement.clientWidth
      const bottom = bounds ? Math.min(innerHeight, bounds.bottom) : innerHeight
      const max = scroller ? scroller.scrollHeight - scroller.clientHeight : document.documentElement.scrollHeight - innerHeight
      const progress = max > 1 ? Math.max(0, Math.min(1, (scroller?.scrollTop ?? window.scrollY) / max)) : 1
      const base = Math.min(bottom - 8, footer.getBoundingClientRect().top)
      layer.style.cssText = `position:fixed;pointer-events:none;z-index:20;left:${left}px;top:${base - 26}px;width:${width}px;height:34px;color:var(--arkive-nav-accent, #eab12b)`
      const svg = layer.querySelector('svg')!
      svg.setAttribute('viewBox', `0 0 ${width} 34`)
      const y = (x: number) => 26 + 1.8 * Math.sin(x / 40 * 2 * Math.PI)
      let path = ''
      for (let x = 0; x <= width + 6; x += 6) path += `${x ? ' L' : 'M'}${x} ${y(x).toFixed(2)}`
      layer.querySelectorAll('[data-route]').forEach(el => el.setAttribute('d', path))
      const done = layer.querySelector<SVGPathElement>('[data-done]')!
      done.style.clipPath = `inset(0 ${(1 - progress) * 100}% 0 0)`
      const ship = layer.querySelector<HTMLElement>('[data-ship]')!
      const x = Math.max(14, Math.min(width - 14, progress * width))
      ship.style.left = `${x}px`
      ship.style.top = `${y(x)}px`
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw) }
    owner.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    desktop.addEventListener('change', schedule)
    const observer = new ResizeObserver(schedule)
    observer.observe(footer)
    observer.observe(scroller ?? document.body)
    if (footer.parentElement) observer.observe(footer.parentElement)
    draw()
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      owner.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      desktop.removeEventListener('change', schedule)
    }
  }, [footerRef, mounted])
  if (!mounted) return null
  return createPortal(
    <div ref={layerRef} hidden aria-hidden="true" data-testid="footer-voyage">
      <svg className="h-full w-full overflow-visible" fill="none" stroke="currentColor">
        <path data-route strokeOpacity=".22" />
        <path data-route data-done strokeWidth="2" />
      </svg>
      <span data-ship className="absolute h-[1.625rem] w-6 -translate-x-1/2 -translate-y-full">
        <svg viewBox="0 0 24 26" fill="currentColor"><path d="M11 2 L11 18 L3 18 Z M13 5 L13 18 L20 18 Z M2 20 H22 L19 24 H5 Z" /></svg>
      </span>
    </div>, document.body,
  )
}
