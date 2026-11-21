import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import { cn } from '@gamemap/ui'
import { KNOWLEDGE_SECTIONS, REFERENCE_ENTRIES, type KnowledgeDirectory } from './encyclopediaNavigation'
import type { NavKey } from './TopNav'
import type { SectionKey } from '../features/knowledge/memory'

const railRecord = defineMemoryRecord({
  id: 'rail-collapsed', namespace: 'vrising', surface: 'encyclopedia',
  ...memoryPolicy.sessionContext('reset-encyclopedia-navigation'), schemaVersion: '1.0.0',
  defaultValue: () => false, validate: isBoolean,
})

export function EncyclopediaLayout({ active, directory, children }: { active: NavKey; directory?: KnowledgeDirectory; children: ReactNode }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useMemoryState(railRecord)
  const selected = directory ? `${active}:${directory.selected}` : active
  const entries = REFERENCE_ENTRIES.map(entry => ({
    key: entry.key, label: t(entry.labelKey), icon: <entry.icon className="size-6" aria-hidden />,
    children: directory && entry.key === active ? KNOWLEDGE_SECTIONS[directory.kind].map(section => ({
      key: `${active}:${section.key}`, label: t(`knowledge.sections.${section.key}.title`),
      icon: <section.icon className="size-4" aria-hidden />,
    })) : undefined,
  }))

  return <ArkiveEncyclopediaWorkspace groups={[{ key: 'wiki', label: t('encyclopedia.label'), entries }]}
    active={selected} label={t('encyclopedia.label')} collapsed={collapsed} onCollapsedChange={setCollapsed}
    collapseLabel={t('encyclopedia.collapse')} expandLabel={t('encyclopedia.expand')}
    renderLink={(entry, className, content) => {
      const section = entry.key.split(':')[1] as SectionKey | undefined
      if (section && directory) {
        const available = directory.available.includes(section)
        return <button type="button" disabled={!available} onClick={() => directory.onSelect(section)}
          className={cn(className, 'w-full text-left disabled:cursor-default disabled:opacity-50',
            !available && 'grid grid-cols-[auto_minmax(0,1fr)] gap-y-0 py-1')}
          aria-pressed={directory.selected === section} data-testid={`encyclopedia-section-${section}`}
          title={available ? entry.label : `${entry.label} · ${t(directory.loading ? 'loading' : 'knowledge.extracting')}`}>
          {content}
          {!available && <span className="col-start-2 text-xs">{t(directory.loading ? 'loading' : 'knowledge.extracting')}</span>}
        </button>
      }
      return <Link to={entry.key as NavKey} className={className} title={entry.label}
        aria-current={entry.key === active ? 'page' : undefined}>{content}</Link>
    }}>
    {children}
  </ArkiveEncyclopediaWorkspace>
}
