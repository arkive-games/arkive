import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMemory } from '@gamemap/state-memory'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { gmzzMemory } from '../lib/memory'
import { RES_BASE } from '../lib/urls'
import { ENCYCLOPEDIA_GROUPS, FELLOW_REFERENCE_TABS, type NavKey } from './navGroups'

const rail = gmzzMemory.session('encyclopedia/rail-collapsed', { default: false, validate: (value: unknown): value is boolean => typeof value === 'boolean' })

export function EncyclopediaLayout({ active, children }: { active: NavKey; children: ReactNode }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useMemory(rail)
  const groups = ENCYCLOPEDIA_GROUPS.map(group => ({ key: group.key, label: t(group.labelKey), entries: group.children.map(entry => ({
    key: entry.key, label: t(entry.labelKey), icon: <img src={`${RES_BASE}/${entry.art}.webp`} alt="" className="size-7 object-contain" />,
    children: entry.key === '/fellows' ? FELLOW_REFERENCE_TABS.map(tab => ({ key: tab.to, label: t(tab.labelKey), icon: <tab.icon className="size-4" aria-hidden /> })) : undefined,
  })) }))
  return <ArkiveEncyclopediaWorkspace active={active} groups={groups} label={t('nav.wiki')}
    collapsed={collapsed} onCollapsedChange={setCollapsed} collapseLabel={t('encyclopedia.collapse')} expandLabel={t('encyclopedia.expand')}
    renderLink={(entry, className, content) => <Link to={entry.key as NavKey} className={className} title={entry.label}
      activeOptions={{ exact: true }} aria-current={entry.children?.some(child => child.key === active) ? 'location' : entry.key === active ? 'page' : undefined}>{content}</Link>}>
    {children}
  </ArkiveEncyclopediaWorkspace>
}
