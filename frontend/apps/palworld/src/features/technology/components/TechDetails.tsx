import { useTranslation } from 'react-i18next'
import type { TechEntry } from '../../../lib/catalog'
import { ItemLink, BuildingLink } from '../../catalog/components'
import { techType } from '../techModel'

export interface TechDetailsProps {
  tech: TechEntry
  name: string
  description?: string
  /** Localized name of the prerequisite tech (`requireTech`), if any. */
  requireTechName?: string
  iname: (id: string) => string
  bname: (id: string) => string
  itemIcon: (id: string) => string | undefined
  buildingIcon: (id: string) => string | undefined
}

/**
 * A technology's full details — the body shown inside the hover card. Its
 * unlock chips are real links, so the card must let the pointer move into it
 * (see HoverCard usage in TechTile).
 */
export function TechDetails({
  tech,
  name,
  description,
  requireTechName,
  iname,
  bname,
  itemIcon,
  buildingIcon,
}: TechDetailsProps) {
  const { t } = useTranslation()
  const ancient = tech.isBoss
  const type = techType(tech)

  return (
    <div className="flex flex-col gap-2 text-left">
      <div className="text-sm font-semibold leading-tight">{name}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={
            ancient
              ? 'rounded bg-purple-500/15 px-1.5 py-0.5 text-xs font-medium text-purple-600 dark:text-purple-300'
              : 'rounded bg-sky-500/15 px-1.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300'
          }
        >
          {ancient ? t('tech.ancientTitle') : t('tech.normalTitle')}
        </span>
        <span className="rounded bg-secondary px-1.5 py-0.5 text-xs font-medium">
          {type === 'item' ? t('tech.typeItem') : t('tech.typeStructure')}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('tech.level', { level: tech.level })} · {t('tech.cost', { count: tech.cost })}
        </span>
      </div>

      {tech.requireTech && requireTechName ? (
        <div className="text-xs text-muted-foreground">
          {t('tech.requires')}: {requireTechName}
        </div>
      ) : null}
      {tech.requireBoss ? (
        <div className="text-xs text-muted-foreground">
          {t('tech.requiresBoss', { boss: tech.requireBoss })}
        </div>
      ) : null}

      {description ? (
        <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}

      {tech.unlockItems.length ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('tech.unlocksItems')}</div>
          <div className="flex flex-wrap gap-1.5">
            {tech.unlockItems.map((id) => (
              <ItemLink key={id} id={id} name={iname(id)} icon={itemIcon(id)} />
            ))}
          </div>
        </div>
      ) : null}

      {tech.unlockBuildings.length ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('tech.unlocksBuildings')}</div>
          <div className="flex flex-wrap gap-1.5">
            {tech.unlockBuildings.map((id) => (
              <BuildingLink key={id} id={id} name={bname(id)} icon={buildingIcon(id)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
