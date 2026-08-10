import { useTranslation } from 'react-i18next'
import { ShellSidebar } from '@gamemap/map-shell'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import { SiteInfo } from './SiteInfo'

const collapsedRecord = defineMemoryRecord({
  id: 'info-collapsed',
  namespace: 'palworld',
  surface: 'map',
  ...memoryPolicy.userPreference('reset-map-sidebar'),
  schemaVersion: '1.0.0',
  defaultValue: () => true,
  validate: isBoolean,
  legacyKeys: ['palworld.map.siteInfoCollapsed'],
  migrateLegacy: (raw: string) => raw === '1',
})

/**
 * Keep the map as the primary surface on a first visit. Once the visitor opens
 * the panel, their own choice wins forever. Storage lives here rather than in
 * the shell package, which must stay storage-free.
 */
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
        root: 'border-l border-border bg-card font-sans text-sm text-card-foreground shadow-[-0.5rem_0_1.5rem_rgba(7,48,64,0.08)]',
        collapseButton: 'top-4 border border-r-0 border-border bg-card text-foreground shadow-sm dark:text-white',
        content: 'px-4 pt-4',
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  )
}
