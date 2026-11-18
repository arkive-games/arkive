import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { EngineMarker } from '@gamemap/map-engine-gl'
import { CommunityMarkerDetail } from '@gamemap/map-community'
import { formatCoords, markerDetailLabelsFor, type MarkerDetailCompleteAction } from '@gamemap/map-shell'
export interface PbzMarkerDetailProps {
  marker: EngineMarker
  mapId: string
  /** "Category / subtype", already localized by the page. */
  metaLine: string
  iconUrl?: string
  onClose: () => void
  /** Desktop floats beside the marker; mobile docks above the tab bar. */
  anchored: boolean
  /** The completion toggle, for subtypes that can be completed. */
  completeAction?: MarkerDetailCompleteAction
}

/**
 * One marker's details and its comment thread.
 *
 * Uses the shared server-backed comment and image adapter.
 */
export function PbzMarkerDetail({ marker, mapId, metaLine, iconUrl, onClose, anchored, completeAction }: PbzMarkerDetailProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const labels = useMemo(() => markerDetailLabelsFor(language), [language])
  const { text: coordText, aria: coordAria } = formatCoords(marker.x, marker.y)
  return (
    <CommunityMarkerDetail game="pbz" mapId={mapId} markerId={marker.id} language={language}
      name={marker.localizedName || t('map.unnamed')}
      icon={iconUrl ? <img src={iconUrl} alt="" className="size-7 rounded-full bg-neutral-900/80 object-cover" /> : undefined}
      eyebrow={metaLine}
      positionValue={<span aria-label={coordAria} title={coordAria}>{coordText}</span>}
      positionCopyValue={coordText}
      description={marker.localizedDescription}
      completeAction={completeAction}
      labels={labels}
      onClose={onClose}
      anchored={anchored}
    />
  )
}
