import type { ReactNode } from 'react'
import type { EngineMarker } from '@gamemap/map-engine'
import { MarkerPopupCard, formatCoords } from '@gamemap/map-shell'

type VrisingMarker = EngineMarker & {
  resourceKind?: string
  resourceDetail?: string
  movement?: 'fixed' | 'roaming'
  bossLevel?: number | null
  bossAct?: string | null
  bossRegion?: string | null
}

export interface PopupDeps {
  t: (key: string, opts?: Record<string, unknown>) => string
  /** Localized region label for a region id (regions/<map>.json l10n). */
  regionName: (id?: string) => string
  /** Localized category label for a category id. */
  categoryName: (id?: string) => string
}

/**
 * Popup body for a selected marker. The engine renders the frame and calls this
 * for the content, so all i18n and all app links stay on the app side.
 */
export function renderMarkerPopup(marker: EngineMarker, deps: PopupDeps): ReactNode {
  const { t, regionName, categoryName } = deps
  const vrising = marker as VrisingMarker
  const catId = marker.subtypeMeta?.category ?? marker.category
  const catLabel = categoryName(catId)
  const subLabel = marker.subtypeLabel ?? marker.subtype
  const { text: coordText, aria: coordAria } = formatCoords(marker.x, marker.y)
  const catText = [catLabel, subLabel].filter(Boolean).join(' / ')
  const regionLabel = regionName(marker.region)

  // The coords get their own element so the axis-labeled aria/title rides only
  // on the coordinate, not the whole meta line.
  const metaLine = (
    <>
      {catText ? `${catText} ` : ''}
      <span aria-label={coordAria} title={coordAria}>{coordText}</span>
      {regionLabel ? (
        <span className="ml-1 text-muted-foreground" data-testid="marker-region">
          · {regionLabel}
        </span>
      ) : null}
    </>
  )

  return (
    <MarkerPopupCard
      name={marker.localizedName || t('unnamed')}
      metaLine={metaLine}
      description={marker.localizedDescription}
      noDescriptionLabel={t('noDescription')}
    >
      {marker.images?.[0] && !vrising.movement ? (
        <img
          src={marker.images[0]}
          alt=""
          loading="lazy"
          className="mt-3 aspect-[4/3] w-full rounded-md object-contain"
        />
      ) : null}
      {vrising.movement ? (
        <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{t('marker.movement')}</span>
            <span>{t(`marker.${vrising.movement}`)}</span>
          </div>
          {vrising.bossLevel != null ? (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t('marker.level')}</span>
              <span>{vrising.bossLevel}</span>
            </div>
          ) : null}
          {vrising.bossAct ? (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t('marker.act')}</span>
              <span>{vrising.bossAct}</span>
            </div>
          ) : null}
          {vrising.bossRegion ? (
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t('marker.gameRegion')}</span>
              <span>{vrising.bossRegion}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </MarkerPopupCard>
  )
}
