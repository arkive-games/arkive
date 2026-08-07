import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShellSidebar } from '@gamemap/map-shell'
import { SiteInfo } from './SiteInfo'

const COLLAPSED_KEY = 'palworld.map.siteInfoCollapsed'

/**
 * Keep the map as the primary surface on a first visit. Once the visitor opens
 * the panel, their own choice wins forever. Storage lives here rather than in
 * the shell package, which must stay storage-free.
 */
function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY)
    if (stored !== null) return stored === '1'
  } catch {
    /* no storage; use the map-first default below */
  }
  return true
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
      width={304}
      collapsed={collapsed}
      onCollapsedChange={(next) => {
        setCollapsed(next)
        writeCollapsed(next)
      }}
      collapseLabel={label}
      expandLabel={label}
      label={label}
      classNames={{
        root: 'border-l border-border bg-card text-sm text-card-foreground shadow-[-0.5rem_0_1.5rem_rgba(7,48,64,0.08)]',
        collapseButton: 'top-4 border border-r-0 border-border bg-card text-primary shadow-sm',
        content: 'px-4 pt-4',
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  )
}
