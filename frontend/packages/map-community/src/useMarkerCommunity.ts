import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createMarkerComment, createMarkerCommentWithImages, deleteMarkerComment,
  likeMarkerComment, listMarkerCommentReplies, listMarkerComments, listMarkerImages,
  reportMarkerComment, result, updateMarkerComment, uploadMarkerImage,
  type ApiClient, type CreateMarkerCommentBody, type MarkerCommentRead, type MarkerImageRead,
} from '@gamemap/api-core'
import type { MarkerComment, MarkerCommentsConfig, MarkerCommentSort, MarkerDetailLabels, MarkerGalleryConfig } from '@gamemap/map-shell'

type Client = ApiClient['client']
type Options = {
  client: Client | null
  game: CreateMarkerCommentBody['game']
  mapId: string
  markerId: string
  viewerUid: number | null
  language: string
  labels: MarkerDetailLabels
}

const PAGE_SIZE = 50
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

function validateFiles(files: File[], labels: MarkerDetailLabels) {
  if (files.length > 3) throw new Error(labels.attachmentLimit)
  if (files.some((file) => file.size > MAX_IMAGE_BYTES)) throw new Error(labels.imageTooLarge)
}

/** The owning component remounts this state for each target and account. */
export function useMarkerCommunity({ client, game, mapId, markerId, viewerUid, language, labels }: Options) {
  const [sort, setSort] = useState<MarkerCommentSort>('latest')
  const [comments, setComments] = useState<MarkerCommentRead[]>([])
  const [images, setImages] = useState<MarkerImageRead[]>([])
  const [replies, setReplies] = useState<Record<string, MarkerCommentRead[]>>({})
  const [replyingTo, setReplyingTo] = useState<MarkerCommentRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const target = useMemo(() => ({ game, map: mapId, marker: markerId }), [game, mapId, markerId])
  const reload = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    let active = true
    if (!client) { setLoading(false); return }
    setLoading(true)
    setError(null)
    const readImages = async () => {
      const all: MarkerImageRead[] = []
      for (let imagePage = 1; ; imagePage++) {
        const data = await result(listMarkerImages({ client, throwOnError: true, query: { ...target, page: imagePage, pageSize: PAGE_SIZE } }))
        all.push(...(data.results ?? []))
        if (all.length >= data.count || !data.results?.length || !active) return all
      }
    }
    void Promise.all([
      result(listMarkerComments({ client, throwOnError: true, query: { ...target, sort, page: 1, pageSize: PAGE_SIZE } })),
      readImages(),
    ]).then(([data, media]) => {
      if (!active) return
      setComments(data.results ?? [])
      // Logout clears the client-side account before its cookie request finishes.
      // A fresh guest read can briefly carry the old cookie, so never retain
      // non-public media for a guest even when that response includes it.
      setImages(media.filter((image) => image.status === 'published' || (
        viewerUid != null && (image.author.uid === viewerUid || image.canReview)
      )))
      setTotal(data.count)
      setPage(1)
      setReplies({})
    }).catch(() => { if (active) setError(labels.loadFailed) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [client, target, sort, revision, labels.loadFailed, viewerUid])

  const writer = useCallback(() => {
    if (!client || viewerUid == null) throw new Error(labels.signInRequired)
    return client
  }, [client, viewerUid, labels.signInRequired])

  const find = (id: string) => comments.find((row) => row.id === id) ?? Object.values(replies).flat().find((row) => row.id === id)
  const replace = (updated: MarkerCommentRead) => {
    if (updated.parentId) {
      const parentId = updated.parentId
      setReplies((current) => ({ ...current, [parentId]: (current[parentId] ?? []).map((row) => row.id === updated.id ? updated : row) }))
    } else setComments((current) => current.map((row) => row.id === updated.id ? updated : row))
  }

  const onSubmit = async (_marker: string, body: string, files: File[]) => {
    const c = writer()
    validateFiles(files, labels)
    setSubmitting(true)
    try {
      const parentId = replyingTo?.id
      let created: MarkerCommentRead
      if (files.length) {
        const response = await result(createMarkerCommentWithImages({
          client: c, throwOnError: true, query: target,
          body: { body, parentId: parentId ?? '', files },
        }))
        created = response.comment
        setImages((current) => [...current, ...(response.images ?? [])])
      } else {
        created = await result(createMarkerComment({ client: c, throwOnError: true, body: { ...target, body, ...(parentId ? { parentId } : {}) } }))
      }
      if (parentId) {
        setReplies((current) => ({ ...current, [parentId]: [...(current[parentId] ?? []), created] }))
        setComments((current) => current.map((row) => row.id === parentId ? { ...row, replyCount: row.replyCount + 1 } : row))
        setReplyingTo(null)
      } else {
        setComments((current) => [created, ...current])
        setTotal((value) => value + 1)
      }
    } catch {
      throw new Error(labels.commentFailed)
    } finally { setSubmitting(false) }
  }

  const onUpload = async (_marker: string, files: File[]) => {
    const c = writer()
    validateFiles(files, labels)
    // Keep successful contributions if a later file fails; each is its own
    // gallery item. Comment attachments instead use one atomic request above.
    for (const file of files) {
      try {
        const uploaded = await result(uploadMarkerImage({ client: c, throwOnError: true, query: target, body: { file } }))
        setImages((current) => [...current, uploaded])
      } catch { throw new Error(labels.commentFailed) }
    }
  }

  const dateFormat = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }), [language])
  const imageLabel = (status: string) => status === 'pending' ? labels.awaitingReview : status === 'rejected' ? labels.imageRejected : undefined
  const view = (row: MarkerCommentRead, reply: boolean): MarkerComment => ({
    id: row.id, markerId: row.marker, authorName: row.author.name, authorAvatarUrl: row.author.avatarUrl,
    createdLabel: dateFormat.format(new Date(row.createdAt)), body: row.body,
    attachments: images.filter((image) => image.commentId === row.id).sort((a, b) => a.position - b.position).map((image) => ({
      id: image.id, commentId: row.id, url: image.url, alt: labels.gallery,
      moderationLabel: imageLabel(image.status),
    })),
    likeCount: row.likeCount, liked: row.liked, replyCount: reply ? 0 : row.replyCount,
    mine: viewerUid === row.author.uid, edited: row.editedAt != null, reply,
  })
  const items = comments.flatMap((row) => [view(row, false), ...(replies[row.id] ?? []).map((child) => view(child, true))])

  const config: MarkerCommentsConfig = {
    markerId, items, sort, onSortChange: setSort, submitting: submitting || loading, loading, error, onRetry: reload, onSubmit, allowAttachments: true,
    onLike: (id) => {
      try {
        const c = writer()
        const row = find(id)
        if (row) void result(likeMarkerComment({ client: c, throwOnError: true, path: { id }, body: { liked: !row.liked } })).then(replace).catch(() => setError(labels.commentFailed))
      } catch (failure) { setError((failure as Error).message) }
    },
    onReply: (id) => { const row = find(id); const parent = row?.parentId ? find(row.parentId) : row; if (parent) setReplyingTo(parent) },
    onViewReplies: (id) => {
      if (!client) return
      const next = Math.floor((replies[id]?.length ?? 0) / PAGE_SIZE) + 1
      void result(listMarkerCommentReplies({ client, throwOnError: true, path: { id }, query: { page: next, pageSize: PAGE_SIZE } }))
        .then((data) => setReplies((current) => ({ ...current, [id]: [...new Map([...(current[id] ?? []), ...(data.results ?? [])].map((row) => [row.id, row])).values()] })))
        .catch(() => setError(labels.loadFailed))
    },
    onEdit: async (id, body) => {
      try { replace(await result(updateMarkerComment({ client: writer(), throwOnError: true, path: { id }, body: { body } }))) }
      catch { throw new Error(labels.commentFailed) }
    },
    onDelete: async (id) => {
      try {
        await result(deleteMarkerComment({ client: writer(), throwOnError: true, path: { id } }))
        const row = find(id)
        if (row?.parentId) {
          const parentId = row.parentId
          setReplies((current) => ({ ...current, [parentId]: (current[parentId] ?? []).filter((child) => child.id !== id) }))
          setComments((current) => current.map((parent) => parent.id === parentId ? { ...parent, replyCount: Math.max(0, parent.replyCount - 1) } : parent))
        } else {
          setComments((current) => current.filter((row) => row.id !== id))
          setTotal((value) => Math.max(0, value - 1))
        }
      } catch { throw new Error(labels.commentFailed) }
    },
    onReport: async (id, reason) => {
      try { await result(reportMarkerComment({ client: writer(), throwOnError: true, path: { id }, body: { reason } })) }
      catch { throw new Error(labels.commentFailed) }
    },
    replyingTo: replyingTo?.author.name, onCancelReply: () => setReplyingTo(null),
    onLoadMore: comments.length < total ? async () => {
      if (!client) return
      const data = await result(listMarkerComments({ client, throwOnError: true, query: { ...target, sort, page: page + 1, pageSize: PAGE_SIZE } }))
      setComments((current) => [...new Map([...current, ...(data.results ?? [])].map((row) => [row.id, row])).values()])
      setPage((value) => value + 1)
    } : undefined,
  }
  const gallery: MarkerGalleryConfig = {
    markerId, onUpload, loading,
    images: images.filter((image) => !image.commentId).map((image) => ({
      id: image.id, markerId, url: image.url, alt: labels.gallery, authorName: image.author.name,
      createdLabel: dateFormat.format(new Date(image.createdAt)),
      moderationStatus: image.status === 'pending' ? 'awaiting-review' : image.status,
      moderationLabel: imageLabel(image.status),
    })),
  }
  return { config, gallery, error, reload }
}
