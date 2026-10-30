import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { EngineMarker } from '@gamemap/map-engine-gl'
import { MarkerDetailDrawer, formatCoords, markerDetailLabelsFor, type MarkerDetailCompleteAction } from '@gamemap/map-shell'
import { useAuth } from '@gamemap/auth'

import { useMarkerComments } from '../../lib/markerComments'

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
 * The drawer replaced `MarkerPopupCard` here because the card has no comment
 * section at all; palworld, aion2 and V Rising already render the drawer, so PBZ
 * now reads like the rest of the platform. The gallery stays empty: PBZ markers
 * carry no player images, and comments carry none either.
 */
export function PbzMarkerDetail({ marker, mapId, metaLine, iconUrl, onClose, anchored, completeAction }: PbzMarkerDetailProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const labels = useMemo(() => markerDetailLabelsFor(language), [language])
  const auth = useAuth()
  const { text: coordText, aria: coordAria } = formatCoords(marker.x, marker.y)

  const comments = useMarkerComments({
    client: auth.enabled ? auth.client.requestClient : null,
    mapId,
    markerId: marker.id,
    viewerUid: auth.user?.uid ?? null,
    language,
    signInMessage: t('map.commentSignIn'),
    loadFailedMessage: t('map.commentsLoadFailed'),
  })

  return (
    <MarkerDetailDrawer
      name={marker.localizedName || t('map.unnamed')}
      icon={iconUrl ? <img src={iconUrl} alt="" className="size-7 rounded-full bg-neutral-900/80 object-cover" /> : undefined}
      eyebrow={metaLine}
      positionValue={<span aria-label={coordAria} title={coordAria}>{coordText}</span>}
      positionCopyValue={coordText}
      description={marker.localizedDescription}
      comments={comments.config}
      completeAction={completeAction}
      labels={labels}
      onClose={onClose}
      anchored={anchored}
    >
      {comments.error ? (
        <p role="alert" className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive" data-testid="marker-comments-load-error">
          {comments.error}
        </p>
      ) : null}
    </MarkerDetailDrawer>
  )
}
