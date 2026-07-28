import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShellSidebar } from '@gamemap/map-shell'
import { SiteInfo } from './SiteInfo'

const COLLAPSED_KEY = 'palworld.map.siteInfoCollapsed'
/** Below this, 346 (left sidebar) + 320 (this one) leaves the map a sliver. */
const FIRST_VISIT_MIN_WIDTH = 1200

/**
 * Expanded on a first-ever visit so the feedback invite is actually seen, then
 * the visitor's own choice wins forever. Storage lives here rather than in the
 * shell package, which must stay storage-free.
 */
function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY)
    if (stored !== null) return stored === '1'
  } catch {
    /* no storage — fall through to the width-based default */
  }
  // No recorded choice: expanded so the feedback invite is actually seen —
  // except on a narrow desktop, where the map would have nothing left. This
  // is a client-only SPA (no SSR), so `window` is always present here.
  return window.innerWidth < FIRST_VISIT_MIN_WIDTH
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* no storage */
  }
}

export function InfoSidebar() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const label = t('siteInfo.tab')

  return (
    <ShellSidebar
      side="right"
      width={320}
      collapsed={collapsed}
      onCollapsedChange={(next) => {
        setCollapsed(next)
        writeCollapsed(next)
      }}
      // The tab names what it opens rather than saying "Collapse"/"Expand".
      collapseLabel={label}
      expandLabel={label}
      // Names the <aside> landmark, so screen-reader landmark navigation can
      // tell this sidebar apart from the filter sidebar on the same page.
      label={label}
      classNames={{
        root: 'border-l border-border bg-gradient-to-b from-card to-background text-sm text-card-foreground',
        collapseButton: 'bg-secondary text-secondary-foreground',
        content: 'px-3 pt-3',
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  )
}
