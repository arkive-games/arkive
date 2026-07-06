import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@gamemap/ui'
import type { TechEntry } from '../../../lib/catalog'
import { ItemLink, BuildingLink } from '../../catalog/components'
import type { TechType } from '../techModel'

export interface TechDialogProps {
  /** The selected tech, or null when the dialog is closed. */
  tech: TechEntry | null
  name: string
  description?: string
  type: TechType
  ancient: boolean
  /** Localized name of the prerequisite tech (`requireTech`), if any. */
  requireTechName?: string
  onClose: () => void
  iname: (id: string) => string
  bname: (id: string) => string
  itemIcon: (id: string) => string | undefined
  buildingIcon: (id: string) => string | undefined
}

/** Modal showing a technology's full details (the click "popup"). */
export function TechDialog({
  tech,
  name,
  description,
  type,
  ancient,
  requireTechName,
  onClose,
  iname,
  bname,
  itemIcon,
  buildingIcon,
}: TechDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={tech !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {tech ? (
          <>
            <DialogHeader>
              <DialogTitle>{name}</DialogTitle>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span
                  className={
                    ancient
                      ? 'rounded bg-purple-500/15 px-1.5 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-300'
                      : 'rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300'
                  }
                >
                  {ancient ? t('tech.ancientTitle') : t('tech.normalTitle')}
                </span>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium">
                  {type === 'item' ? t('tech.typeItem') : t('tech.typeStructure')}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {t('tech.level', { level: tech.level })} · {t('tech.cost', { count: tech.cost })}
                </span>
              </div>
            </DialogHeader>

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
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            ) : null}

            {tech.unlockItems.length ? (
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">{t('tech.unlocksItems')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {tech.unlockItems.map((id) => (
                    <ItemLink key={id} id={id} name={iname(id)} icon={itemIcon(id)} />
                  ))}
                </div>
              </div>
            ) : null}

            {tech.unlockBuildings.length ? (
              <div>
                <div className="mb-1 text-[11px] text-muted-foreground">
                  {t('tech.unlocksBuildings')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tech.unlockBuildings.map((id) => (
                    <BuildingLink key={id} id={id} name={bname(id)} icon={buildingIcon(id)} />
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
