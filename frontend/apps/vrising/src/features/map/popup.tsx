import { useMemo, useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import type { EngineMarker } from '@gamemap/map-engine-gl'
import { MarkerDetailDrawer, formatCoords, markerDetailLabelsFor } from '@gamemap/map-shell'

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
  language: string
  regionName: (id?: string) => string
  categoryName: (id?: string) => string
  iconUrl?: string
  onClose: () => void
  onSelectMarker: (id: string) => void
}

export function VrisingMarkerDetail({ marker, deps, anchored = false }: { marker: EngineMarker; deps: PopupDeps; anchored?: boolean }) {
  const { t, language, regionName, categoryName, iconUrl, onClose, onSelectMarker } = deps
  const [commentSort, setCommentSort] = useState<'popular' | 'latest'>('popular')
  const labels = useMemo(() => markerDetailLabelsFor(language), [language])
  const vrising = marker as VrisingMarker
  const catId = marker.subtypeMeta?.category ?? marker.category
  const catLabel = categoryName(catId)
  const subLabel = marker.subtypeLabel ?? marker.subtype
  const { text: coordText, aria: coordAria } = formatCoords(marker.x, marker.y)
  const regionLabel = regionName(marker.region)
  const metaLine = [catLabel, subLabel, regionLabel].filter(Boolean).join(' / ')
  const name = marker.localizedName || t('unnamed')
  const facts = [
    vrising.positionPrecision === 'terrain-chunk-center'
      ? { label: '', value: t('marker.terrainChunkPrecision') }
      : null,
    vrising.movement ? { label: t('marker.movement'), value: t(`marker.${vrising.movement}`) } : null,
    vrising.bossLevel != null ? { label: t('marker.level'), value: String(vrising.bossLevel) } : null,
    vrising.bossAct ? { label: t('marker.act'), value: vrising.bossAct } : null,
    vrising.bossRegion ? { label: t('marker.gameRegion'), value: vrising.bossRegion } : null,
  ].filter((fact): fact is { label: string; value: string } => fact != null)

  return (
    <MarkerDetailDrawer
      name={name}
      icon={iconUrl ? <img src={iconUrl} alt="" className="size-7 object-contain" /> : undefined}
      eyebrow={metaLine}
      positionValue={<span aria-label={coordAria} title={coordAria}>{coordText}</span>}
      positionCopyValue={coordText}
      description={marker.localizedDescription}
      facts={facts.length ? (
        <dl className="divide-y divide-border border-y border-border text-sm">
          {facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`} className="flex min-h-9 items-center justify-between gap-3 py-1.5">
              {fact.label ? <dt className="text-muted-foreground">{fact.label}</dt> : null}
              <dd className={fact.label ? 'text-right font-medium' : 'text-muted-foreground'}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : undefined}
      gallery={{
        markerId: marker.id,
        images: vrising.movement ? [] : (marker.images ?? []).map((url, index) => ({
          id: `${marker.id}-image-${index}`,
          markerId: marker.id,
          url,
          alt: name,
          moderationStatus: 'published' as const,
        })),
      }}
      comments={{ markerId: marker.id, items: [], sort: commentSort, onSortChange: setCommentSort }}
      labels={labels}
      onClose={onClose}
      anchored={anchored}
    >
      {vrising.pairedMarkerId && vrising.connection === 'bidirectional' && vrising.connectionGroup ? (
        <section className="border-b border-border bg-card px-3 py-2.5">
          <div className="mb-2 flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t('marker.connection')}</span>
            <span className="text-right">
              {t('marker.connectionGroup', { group: vrising.connectionGroup })}
              {' / '}
              {t('marker.bidirectional')}
            </span>
          </div>
          <button
            type="button"
            data-testid="marker-connection-other-end"
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-primary/40 hover:bg-muted"
            onClick={() => onSelectMarker(vrising.pairedMarkerId!)}
          >
            <ArrowRightLeft className="size-4" aria-hidden="true" />
            {t('marker.goToOtherEnd')}
          </button>
        </section>
      ) : null}
    </MarkerDetailDrawer>
  )
}
