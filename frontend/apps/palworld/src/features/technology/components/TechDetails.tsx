import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import type { TechEntry } from '../../../lib/catalog'
import {
  CHIP,
  ItemLink,
  BuildingLink,
  ItemGlyph,
  BuildingGlyph,
  PalLink,
  HoverCardHeader,
} from '../../catalog/components'
import { techType, type TechResolvers } from '../techModel'

export interface TechDetailsProps {
  tech: TechEntry
  resolvers: TechResolvers
}

/**
 * A technology's full details — the body shown inside the hover card. Its
 * unlock chips are real links, so the card must let the pointer move into it
 * (see HoverCard usage in TechTile).
 */
export function TechDetails({ tech, resolvers }: TechDetailsProps) {
  const { t } = useTranslation()
  const ancient = tech.isBoss
  const type = techType(tech)
  const name = resolvers.name(tech)
  const image = resolvers.image(tech)
  const description = resolvers.description(tech)
  const reqPal = resolvers.requirePal(tech)
  const reqBossName = resolvers.requireBossName(tech)
  const reqResearchName = resolvers.requireResearchName(tech)
  const reqTechEntry = resolvers.requireTechEntry(tech)
  const reqTechName = resolvers.requireTechName(tech)

  return (
    <div className="flex flex-col gap-2 text-left">
      <HoverCardHeader
        glyph={
          image ? (
            image.kind === 'item' ? (
              <ItemGlyph icon={image.icon} size={32} />
            ) : (
              <BuildingGlyph icon={image.icon} size={32} />
            )
          ) : null
        }
        name={name}
        id={tech.id}
      />
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

      {reqPal || reqBossName || reqTechName || reqResearchName ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('tech.unlockBy')}</div>
          <div className="flex flex-col items-start gap-1 text-xs">
            {reqPal ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">{t('tech.reqCapture')}</span>
                <PalLink id={reqPal.id} name={reqPal.name} icon={reqPal.icon} />
              </div>
            ) : null}
            {reqBossName ? (
              <div>
                <span className="text-muted-foreground">{t('tech.reqDefeat')}</span> {reqBossName}
              </div>
            ) : null}
            {reqTechName ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">{t('tech.reqUnlock')}</span>
                {reqTechEntry ? (
                  <TechRefChip entry={reqTechEntry} resolvers={resolvers} />
                ) : (
                  <span>{reqTechName}</span>
                )}
              </div>
            ) : null}
            {reqResearchName ? (
              <div>
                <span className="text-muted-foreground">{t('tech.reqResearch')}</span>{' '}
                {reqResearchName}
              </div>
            ) : null}
          </div>
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
              <ItemLink key={id} id={id} name={resolvers.iname(id)} icon={resolvers.itemIcon(id)} />
            ))}
          </div>
        </div>
      ) : null}

      {tech.unlockBuildings.length ? (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">{t('tech.unlocksBuildings')}</div>
          <div className="flex flex-wrap gap-1.5">
            {tech.unlockBuildings.map((id) => (
              <BuildingLink
                key={id}
                id={id}
                name={resolvers.bname(id)}
                icon={resolvers.buildingIcon(id)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** A cross-link chip to the prerequisite tech (`/technology?tech=<id>`). A local
 *  plain-chip variant of `TechChip`: this card is already a hover card, so the
 *  nested chip never opens one (and importing TechChip here would be circular). */
function TechRefChip({ entry, resolvers }: { entry: TechEntry; resolvers: TechResolvers }) {
  const name = resolvers.name(entry)
  const image = resolvers.image(entry)
  return (
    <Link to="/technology" search={{ tech: entry.id }} className={CHIP} title={name}>
      {image ? (
        image.kind === 'item' ? (
          <ItemGlyph icon={image.icon} />
        ) : (
          <BuildingGlyph icon={image.icon} />
        )
      ) : null}
      {name}
    </Link>
  )
}
