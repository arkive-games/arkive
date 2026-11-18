import { useEffect, useState } from 'react'
import { useOptionalAuth } from '@gamemap/auth'
import { listOwnRoles, listPendingMarkerImages, reviewMarkerImage, result, type ApiClient, type CreateMarkerCommentBody, type MarkerImageRead } from '@gamemap/api-core'
import { MarkerDetailDrawer, type MarkerDetailDrawerProps, type MarkerDetailLabels } from '@gamemap/map-shell'
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
      {client && auth?.user ? <ImageReviewQueue client={client} userId={auth.user.id} superuser={auth.user.isSuperuser} labels={props.labels} onReviewed={community.reload} /> : null}
    </MarkerDetailDrawer>
  )
}

function ImageReviewQueue({ client, userId, superuser, labels, onReviewed }: { client: ApiClient['client']; userId: string; superuser: boolean; labels: MarkerDetailLabels; onReviewed: () => void }) {
  const [allowed, setAllowed] = useState(superuser)
  const [open, setOpen] = useState(false)
  const [images, setImages] = useState<MarkerImageRead[]>([])
  const [count, setCount] = useState(0)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (!superuser) void result(listOwnRoles({ client, throwOnError: true })).then((data) => { if (active) setAllowed(Boolean(data.results?.length)) }).catch(() => { if (active) setAllowed(false) })
    return () => { active = false }
  }, [client, userId, superuser])
  useEffect(() => {
    let active = true
    if (allowed && open) {
      setError(false)
      void result(listPendingMarkerImages({ client, throwOnError: true, query: { page: 1, pageSize: 50 } })).then((data) => {
        if (active) { setImages(data.results ?? []); setCount(data.count) }
      }).catch(() => { if (active) setError(true) })
    }
    return () => { active = false }
  }, [client, allowed, open, revision])
  if (!allowed) return null
  const review = async (id: string, publish: boolean) => {
    setBusy(true)
    setError(false)
    try {
      await result(reviewMarkerImage({ client, throwOnError: true, path: { id }, body: { publish } }))
      setRevision((value) => value + 1)
      onReviewed()
    } catch { setError(true) } finally { setBusy(false) }
  }
  return (
    <section className="border-b border-border px-3 py-2 text-sm" data-testid="marker-image-review">
      <button type="button" className="min-h-10 font-medium text-primary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{labels.reviewImages}{open ? ` (${count})` : ''}</button>
      {error ? <p role="alert" className="text-xs text-destructive">{labels.loadFailed}</p> : null}
      {open ? images.map((image) => (
        <figure key={image.id} className="mb-3">
          <a href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={labels.gallery} loading="lazy" className="max-h-40 w-full rounded-md object-contain" /></a>
          <figcaption className="my-1 break-all text-xs text-muted-foreground">{image.author.name} / {image.game} / {image.map} / {image.marker}</figcaption>
          <div className="flex gap-2">
            <button type="button" disabled={busy} className="min-h-9 rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50" onClick={() => void review(image.id, true)}>{labels.approveImage}</button>
            <button type="button" disabled={busy} className="min-h-9 rounded-md border border-border px-3 disabled:opacity-50" onClick={() => void review(image.id, false)}>{labels.rejectImage}</button>
          </div>
        </figure>
      )) : null}
      {open && !error && count === 0 ? <p className="py-2 text-xs text-muted-foreground">{labels.noPendingImages}</p> : null}
    </section>
  )
}
