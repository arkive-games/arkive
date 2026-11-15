import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { defineMemoryRecord, isBoolean, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
import { PAL_REFERENCE_ENTRIES, DATABASE_REFERENCE_ENTRIES } from './encyclopediaNavigation'
import { itemIconUrl } from '../lib/assets'
import gameIcon from '../assets/palworld-icon.webp'
import type { NavKey } from './TopNav'

/** Existing game assets represent the content rather than generic interface glyphs. */
const categoryArt: Record<string, string> = {
  '/pals': 'T_SheepBall_icon_normal',
  '/passives': 'item_PalPassiveSkillChange_Nocturnal',
  '/active-skills': 'item_SkillCard_PowerShot',
  '/partner-skills': 'build_WorkBench_SkillUnlock',
  '/items': 'item_PalSphere',
  '/buildings': 'build_WorkBench',
  '/merchants': 'item_Money',
  '/technology': 'item_TechnologyBook_G1',
  '/research': 'item_AncientTechnologyBook_G1',
  '/dungeons': 'item_TreasureMap01',
  '/quests': 'item_TreasureMap02',
  '/basecamp': 'build_PalBoxV2',
  '/raids': 'item_PalSphere_Ancient_1',
  '/fishing': 'item_FishingRod_01_1',
}
const art = (src: string) => <img src={src} alt="" className="size-7 object-contain" />

const railRecord = defineMemoryRecord({
  id: 'rail-collapsed', namespace: 'palworld', surface: 'encyclopedia',
  ...memoryPolicy.sessionContext('reset-encyclopedia-navigation'), schemaVersion: '1.0.0',
  defaultValue: () => false, validate: isBoolean,
})
export function EncyclopediaLayout({ active, children }: { active: NavKey; children: ReactNode }) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useMemoryState(railRecord)
  const groups = [
    { key: 'pals', label: t('nav.pals'), collapsible: true, icon: art(gameIcon), entries: PAL_REFERENCE_ENTRIES },
    { key: 'database', label: t('nav.database'), collapsible: true, icon: art(itemIconUrl('item_TechnologyBook_G2')), entries: DATABASE_REFERENCE_ENTRIES },
  ].map(group => ({ ...group, entries: group.entries.map(entry => ({ key: entry.key, label: t(entry.labelKey), icon: art(itemIconUrl(categoryArt[entry.key])) })) }))
  return <ArkiveEncyclopediaWorkspace active={active} groups={groups} label={t('encyclopedia.label')} appearance="quiet"
    collapsed={collapsed} onCollapsedChange={setCollapsed} collapseLabel={t('encyclopedia.collapse')} expandLabel={t('encyclopedia.expand')}
    renderLink={(entry, className, content) => <Link to={entry.key as NavKey} className={className} aria-current={active === entry.key ? 'page' : undefined} title={entry.label}>{content}</Link>}>
    {children}
  </ArkiveEncyclopediaWorkspace>
}
