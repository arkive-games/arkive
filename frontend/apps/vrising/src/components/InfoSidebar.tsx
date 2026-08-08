import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShellSidebar } from '@gamemap/map-shell'
import { SiteInfo } from './SiteInfo'

const COLLAPSED_KEY = 'vrising.map.siteInfoCollapsed'

function readCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY)
    if (stored !== null) return stored === '1'
  } catch {
    // Keep the map-first default when storage is unavailable.
  }
  return true
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // The panel remains usable without persistence.
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
        root: 'border-l border-border bg-card font-sans text-sm text-card-foreground',
        collapseButton: 'top-4 border border-r-0 border-border bg-card text-foreground shadow-sm dark:text-white',
        content: 'px-4 pt-4',
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  )
}
