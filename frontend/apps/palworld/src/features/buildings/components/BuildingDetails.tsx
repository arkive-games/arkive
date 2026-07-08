import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { BuildingEntry, BuildingsBundle } from '../../../lib/catalog'
import { buildingTypeLabel } from '../../catalog/labels'
import { MaterialRow } from '../../catalog/components'

export interface BuildingDetailsProps {
  building: BuildingEntry
  name: string
  typeLabels: BuildingsBundle['typeLabels']
  /** Localized item name for a material id. */
  iname: (id: string) => string
  /** Localized technology name for a tech id. */
  techName: (id: string) => string
}

/**
 * A building's quick details — the body shown inside the hover card. Its
 * material and tech chips are real links, so the card must let the pointer move
 * into it (see HoverCard usage in BuildingTile).
 */
export function BuildingDetails({ building, name, typeLabels, iname, techName }: BuildingDetailsProps) {
  const { t } = useTranslation()
  const energy = building.energyType ? building.energyType.replace(/^E[A-Za-z]+::/, '') : ''

  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="text-sm font-semibold leading-tight">{name}</div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
          {buildingTypeLabel(building.typeA, typeLabels)}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {building.rank ? `${t('building.rank')} ${building.rank}` : null}
          {building.rank && building.work ? ' · ' : null}
          {building.work ? `${t('building.work')} ${building.work}` : null}
          {(building.rank || building.work) && energy ? ' · ' : null}
          {energy ? `${t('building.energy')} ${energy}` : null}
        </span>
      </div>

      {building.materials.length ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('building.section.materials')}</div>
          <div className="divide-y divide-border/60">
            {building.materials.map((m) => (
              <MaterialRow key={m.item} id={m.item} name={iname(m.item)} count={m.count} />
            ))}
          </div>
        </div>
      ) : null}

      {building.unlockTech?.length ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('building.fromTech')}</div>
          <div className="flex flex-wrap gap-1.5">
            {building.unlockTech.map((tid) => (
              <Link
                key={tid}
                to="/technology"
                search={{ tech: tid }}
                className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-2 py-1 text-xs transition hover:border-primary/60 hover:bg-accent"
              >
                {techName(tid)}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
