import type { ReactNode } from 'react'
import type { EngineMarker } from '@gamemap/map-engine'
import { MarkerPopupCard, formatCoords } from '@gamemap/map-shell'

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
    />
  )
}
