import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import { PAL_REFERENCE_ENTRIES, DATABASE_REFERENCE_ENTRIES } from './encyclopediaNavigation'
import type { NavKey } from './TopNav'

const railRecord = defineMemoryRecord({
  id: 'rail-collapsed', namespace: 'palworld', surface: 'encyclopedia',
  ...memoryPolicy.sessionContext('reset-encyclopedia-navigation'), schemaVersion: '1.0.0',
  defaultValue: () => false, validate: isBoolean,
})
export function EncyclopediaLayout({ active, children }: { active: NavKey; children: ReactNode }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useMemoryState(railRecord)
  const groups = [
    { key: 'pals', label: t('nav.pals'), entries: PAL_REFERENCE_ENTRIES },
    { key: 'database', label: t('nav.database'), entries: DATABASE_REFERENCE_ENTRIES },
  ].map(group => ({ ...group, entries: group.entries.map(entry => ({ key: entry.key, label: t(entry.labelKey), icon: <entry.icon className="size-6" aria-hidden /> })) }))
  return <ArkiveEncyclopediaWorkspace active={active} groups={groups} label={t('encyclopedia.label')} appearance="quiet"
    collapsed={collapsed} onCollapsedChange={setCollapsed} collapseLabel={t('encyclopedia.collapse')} expandLabel={t('encyclopedia.expand')}
    renderLink={(entry, className, content) => <Link to={entry.key as NavKey} className={className} aria-current={active === entry.key ? 'page' : undefined} title={entry.label}>{content}</Link>}>
    {children}
  </ArkiveEncyclopediaWorkspace>
}
