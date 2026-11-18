import { useOptionalAuth } from '@gamemap/auth'
import type { CreateMarkerCommentBody } from '@gamemap/api-core'
import { MarkerDetailDrawer, type MarkerDetailDrawerProps } from '@gamemap/map-shell'
import { useMarkerCommunity } from './useMarkerCommunity'

export type CommunityMarkerDetailProps = Omit<MarkerDetailDrawerProps, 'comments'> & {
  game: CreateMarkerCommentBody['game']
  mapId: string
  markerId: string
  language: string
}

/** Account and target changes discard old responses and private pending images. */
export function CommunityMarkerDetail(props: CommunityMarkerDetailProps) {
  const auth = useOptionalAuth()
  return <BoundCommunityMarkerDetail key={`${props.game}/${props.mapId}/${props.markerId}/${auth?.user?.id ?? 'guest'}`} {...props} />
}

function BoundCommunityMarkerDetail({ game, mapId, markerId, language, gallery, children, ...props }: CommunityMarkerDetailProps) {
  const auth = useOptionalAuth()
  const client = auth?.enabled ? auth.client.requestClient : null
  const community = useMarkerCommunity({ client, game, mapId, markerId, language, viewerUid: auth?.user?.uid ?? null, labels: props.labels })
  return (
    <MarkerDetailDrawer {...props} gallery={{ ...community.gallery, images: [...(gallery?.images ?? []), ...community.gallery.images] }} comments={community.config}>
      {community.error ? <p role="alert" className="border-b border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">{community.error}</p> : null}
      {children}
    </MarkerDetailDrawer>
  )
}
