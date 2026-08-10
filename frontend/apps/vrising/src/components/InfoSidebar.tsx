import { useTranslation } from 'react-i18next'
import { ShellSidebar } from '@gamemap/map-shell'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import { SiteInfo } from './SiteInfo'

const collapsedRecord = defineMemoryRecord({
  id: 'info-collapsed', namespace: 'vrising', surface: 'map',
  ...memoryPolicy.userPreference('reset-map-sidebar'),
  schemaVersion: '1.0.0', defaultValue: () => true, validate: isBoolean,
  legacyKeys: ['vrising.map.siteInfoCollapsed'], migrateLegacy: (raw: string) => raw === '1',
})

export function InfoSidebar() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useMemoryState(collapsedRecord)
  const label = t('siteInfo.tab')

  return (
    <ShellSidebar
      side="right"
      width={304}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
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
