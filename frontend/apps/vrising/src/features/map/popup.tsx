import type { ReactNode } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import type { EngineMarker } from '@gamemap/map-engine'
import { MarkerPopupCard, formatCoords } from '@gamemap/map-shell'

type VrisingMarker = EngineMarker & {
  resourceKind?: string
  resourceDetail?: string
  movement?: 'fixed' | 'roaming'
  bossLevel?: number | null
  bossAct?: string | null
  bossRegion?: string | null
  positionPrecision?: 'terrain-chunk-center' | 'authored-transform'
  pairedMarkerId?: string
  connection?: 'bidirectional'
  connectionGroup?: number
}

export interface PopupDeps {
  t: (key: string, opts?: Record<string, unknown>) => string
  /** Localized region label for a region id (regions/<map>.json l10n). */
  regionName: (id?: string) => string
  /** Localized category label for a category id. */
  categoryName: (id?: string) => string
  onSelectMarker: (id: string) => void
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
  const metaLine = (
    <>
      {catText}
      {catText && regionLabel ? <span aria-hidden="true"> / </span> : null}
      {regionLabel ? <span data-testid="marker-region">{regionLabel}</span> : null}
    </>
  )

  return (
    <MarkerPopupCard
      name={marker.localizedName || t('unnamed')}
      metaLine={metaLine}
      positionLabel={t('coordinates')}
      positionValue={<span aria-label={coordAria} title={coordAria}>{coordText}</span>}
      positionCopy={{
        value: coordText,
        copyLabel: t('copyPosition'),
        copiedLabel: t('copied'),
        failedLabel: t('copyFailed'),
      }}
      description={marker.localizedDescription}
      images={vrising.movement ? undefined : marker.images}
    >
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
      {vrising.pairedMarkerId && vrising.connection === 'bidirectional' && vrising.connectionGroup ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('marker.connection')}</span>
            <span>
              {t('marker.connectionGroup', { group: vrising.connectionGroup })}
              {' · '}
              {t('marker.bidirectional')}
            </span>
          </div>
          <button
            type="button"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-muted"
            onClick={() => deps.onSelectMarker(vrising.pairedMarkerId!)}
          >
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            {t('marker.goToOtherEnd')}
          </button>
        </div>
      ) : null}
    </MarkerPopupCard>
  )
}
