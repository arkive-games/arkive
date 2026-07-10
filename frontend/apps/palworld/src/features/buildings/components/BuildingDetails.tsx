import { useTranslation } from 'react-i18next'
import type { BuildingEntry, BuildingsBundle, TechBundle } from '../../../lib/catalog'
import { buildingTypeLabel, energyLabel } from '../../catalog/labels'
import { BuildingGlyph, MaterialChip, useCatalogData } from '../../catalog/components'
import { buildingUnlockLevel, type TechResolvers } from '../../technology/techModel'
import { TechChip } from '../../technology/components/TechChip'

export interface BuildingDetailsProps {
  building: BuildingEntry
  name: string
  typeLabels: BuildingsBundle['typeLabels']
  /** Localized item name for a material id. */
  iname: (id: string) => string
  /** Tech bundle (to resolve unlock-tech entries) + tech chip resolvers. */
  tech: TechBundle
  techResolvers: TechResolvers
}

/**
 * A building's quick details — the body shown inside the hover card. Its
 * material and tech chips are real links, so the card must let the pointer move
 * into it (see HoverCard usage in BuildingTile).
 */
export function BuildingDetails({
  building,
  name,
  typeLabels,
  iname,
  tech,
  techResolvers,
}: BuildingDetailsProps) {
  const { t } = useTranslation()
  const { buildings } = useCatalogData()
  const energy = building.energyType ? energyLabel(building.energyType, buildings?.energyLabels) : ''
  const level = buildingUnlockLevel(building, tech)
  const props = [
    level != null ? `${t('building.level')} ${level}` : '',
    building.work ? `${t('building.work')} ${building.work}` : '',
    energy ? `${t('building.energy')} ${energy}` : '',
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="flex items-center gap-2">
        {building.icon ? <BuildingGlyph icon={building.icon} size={32} /> : null}
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight">{name}</div>
          <div className="font-mono text-xs text-muted-foreground">{building.id}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
          {buildingTypeLabel(building.typeA, typeLabels)}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{props.join(' · ')}</span>
      </div>

      {building.materials.length ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('building.section.materials')}</div>
          <div className="flex flex-wrap gap-1.5">
            {building.materials.map((m) => (
              <MaterialChip key={m.item} id={m.item} name={iname(m.item)} count={m.count} />
            ))}
          </div>
        </div>
      ) : null}

      {building.unlockTech?.length ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('building.fromTech')}</div>
          <div className="flex flex-wrap gap-1.5">
            {building.unlockTech.map((tid) => {
              const entry = tech.byId.get(tid)
              return entry ? (
                <TechChip key={tid} tech={entry} resolvers={techResolvers} />
              ) : null
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
