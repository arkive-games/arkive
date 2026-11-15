import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import { REFERENCE_ENTRIES } from './encyclopediaNavigation'
import type { NavKey } from './TopNav'

const railRecord = defineMemoryRecord({
  id: 'rail-collapsed', namespace: 'pbz', surface: 'encyclopedia',
  ...memoryPolicy.sessionContext('reset-encyclopedia-navigation'), schemaVersion: '1.0.0',
  defaultValue: () => false, validate: isBoolean,
})

export function EncyclopediaLayout({ active, children }: { active: NavKey; children: ReactNode }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useMemoryState(railRecord)
  const entries = REFERENCE_ENTRIES.map(entry => ({
    key: entry.key, label: t(entry.labelKey), icon: <entry.icon className="size-6" strokeWidth={1.8} aria-hidden />,
  }))
  return <ArkiveEncyclopediaWorkspace groups={[{ key: 'wiki', label: t('encyclopedia.label'), entries }]}
    active={active} label={t('encyclopedia.label')} collapsed={collapsed} onCollapsedChange={setCollapsed}
    collapseLabel={t('encyclopedia.collapse')} expandLabel={t('encyclopedia.expand')}
    renderLink={(entry, className, content) => <Link to={entry.key as NavKey} className={className} title={entry.label}
      aria-current={entry.key === active ? 'page' : undefined}>{content}</Link>}>
    {children}
  </ArkiveEncyclopediaWorkspace>
}
