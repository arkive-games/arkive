/**
 * Marker comments for the PBZ map: the fetches, and the state a drawer renders.
 *
 * It lives in the app and not in `@gamemap/map-shell` on purpose. The shell is
 * storage- and fetch-free (CI greps it), so it renders what it is handed and calls
 * back when something happens; this is the half that talks to the backend. The
 * meta forum keeps its equivalent in `apps/meta/src/useForum.ts` for the same
 * reason. A second game wanting this is the signal to lift it into a shared
 * package, not a reason to put it there now.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  createMarkerComment,
  deleteMarkerComment,
  likeMarkerComment,
  listMarkerCommentReplies,
  listMarkerComments,
  reportMarkerComment,
  result,
  updateMarkerComment,
  type ApiClient,
  type MarkerCommentRead,
} from '@gamemap/api-core'
import type {
  MarkerComment,
  MarkerCommentReportReason,
  MarkerCommentSort,
  MarkerCommentsConfig,
} from '@gamemap/map-shell'

type Client = ApiClient['client']

/** The game key every PBZ comment is filed under. */
const GAME = 'pbz' as const

/** One page is a whole thread for any marker that exists today. */
const PAGE_SIZE = 50

export interface MarkerCommentsOptions {
  /** The session's request client, or null when the build has no API at all. */
  client: Client | null
  mapId: string
  markerId: string
  /** The signed-in reader's account number, or null for a visitor. */
  viewerUid: number | null
  language: string
  /** Shown when a visitor tries to write, like or report. */
  signInMessage: string
  /** Shown when the thread cannot be read. */
  loadFailedMessage: string
}

export interface MarkerCommentsState {
  config: MarkerCommentsConfig
  loading: boolean
  error: string | null
}

/**
 * Loads one marker's thread and returns a drawer config wired to the API.
 *
 * Every write applies its server response in place rather than refetching the
 * thread: the endpoints return the updated comment precisely so a like does not
 * cost a second round trip, and a refetch would also reorder a "popular" list
 * under the reader's thumb.
 */
export function useMarkerComments(options: MarkerCommentsOptions): MarkerCommentsState {
  const { client, mapId, markerId, viewerUid, language, signInMessage, loadFailedMessage } = options

  const [sort, setSort] = useState<MarkerCommentSort>('latest')
  const [comments, setComments] = useState<MarkerCommentRead[]>([])
  const [replies, setReplies] = useState<Record<string, MarkerCommentRead[]>>({})
  const [replyingTo, setReplyingTo] = useState<MarkerCommentRead | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setReplies({})
    setReplyingTo(null)
    if (!client) {
      setComments([])
      return
    }
    // A response is applied only while this effect is still current. Without that,
    // clicking from one marker to the next while a slow thread loads paints the
    // first marker's comments under the second.
    let active = true
    setLoading(true)
    setError(null)
    result(listMarkerComments({
      client,
      throwOnError: true,
      query: { game: GAME, map: mapId, marker: markerId, sort, page: 1, pageSize: PAGE_SIZE },
    }))
      .then((page) => {
        if (active) setComments(page.results ?? [])
      })
      .catch(() => {
        if (active) {
          setComments([])
          setError(loadFailedMessage)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
    // viewerUid is a dependency so signing in refetches: "liked" is per reader.
  }, [client, mapId, markerId, sort, viewerUid, loadFailedMessage])

  /** A signed-in client, or a thrown sign-in prompt the drawer shows in place. */
  const writer = useCallback((): Client => {
    if (!client || viewerUid == null) throw new Error(signInMessage)
    return client
  }, [client, viewerUid, signInMessage])

  /** Replaces one comment wherever it appears, top level or reply. */
  const replace = useCallback((updated: MarkerCommentRead) => {
    if (updated.parentId) {
      const parent = updated.parentId
      setReplies((current) => ({
        ...current,
        [parent]: (current[parent] ?? []).map((row) => (row.id === updated.id ? updated : row)),
      }))
    } else {
      setComments((current) => current.map((row) => (row.id === updated.id ? updated : row)))
    }
  }, [])

  const find = useCallback((id: string): MarkerCommentRead | undefined => (
    comments.find((row) => row.id === id) ?? Object.values(replies).flat().find((row) => row.id === id)
  ), [comments, replies])

  const loadReplies = useCallback(async (parentId: string) => {
    if (!client) return
    const page = await result(listMarkerCommentReplies({
      client,
      throwOnError: true,
      path: { id: parentId },
      query: { page: 1, pageSize: PAGE_SIZE },
    }))
    setReplies((current) => ({ ...current, [parentId]: page.results ?? [] }))
  }, [client])

  const onSubmit = useCallback(async (_marker: string, body: string) => {
    const c = writer()
    setSubmitting(true)
    try {
      const parentId = replyingTo?.id
      const created = await result(createMarkerComment({
        client: c,
        throwOnError: true,
        body: { game: GAME, map: mapId, marker: markerId, body, ...(parentId ? { parentId } : {}) },
      }))
      if (parentId) {
        setReplies((current) => ({ ...current, [parentId]: [...(current[parentId] ?? []), created] }))
        setComments((current) => current.map((row) => (
          row.id === parentId ? { ...row, replyCount: row.replyCount + 1 } : row
        )))
        setReplyingTo(null)
      } else {
        // A new comment goes first under either sort: it has no likes yet, but a
        // writer looking for what they just wrote should not have to scroll.
        setComments((current) => [created, ...current])
      }
    } finally {
      setSubmitting(false)
    }
  }, [writer, replyingTo, mapId, markerId])

  const onLike = useCallback((id: string) => {
    let c: Client
    try {
      c = writer()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : signInMessage)
      return
    }
    const current = find(id)
    if (!current) return
    void result(likeMarkerComment({ client: c, throwOnError: true, path: { id }, body: { liked: !current.liked } }))
      .then(replace)
      .catch(() => setError(loadFailedMessage))
  }, [writer, find, replace, signInMessage, loadFailedMessage])

  const onEdit = useCallback(async (id: string, body: string) => {
    const updated = await result(updateMarkerComment({ client: writer(), throwOnError: true, path: { id }, body: { body } }))
    replace(updated)
  }, [writer, replace])

  const onDelete = useCallback(async (id: string) => {
    const target = find(id)
    await result(deleteMarkerComment({ client: writer(), throwOnError: true, path: { id } }))
    if (target?.parentId) {
      const parent = target.parentId
      setReplies((current) => ({ ...current, [parent]: (current[parent] ?? []).filter((row) => row.id !== id) }))
      setComments((current) => current.map((row) => (
        row.id === parent ? { ...row, replyCount: Math.max(0, row.replyCount - 1) } : row
      )))
    } else {
      // Its replies cascade on the server, so they go from view with it.
      setComments((current) => current.filter((row) => row.id !== id))
      setReplies((current) => Object.fromEntries(Object.entries(current).filter(([parent]) => parent !== id)))
    }
  }, [writer, find])

  const onReport = useCallback(async (id: string, reason: MarkerCommentReportReason) => {
    await result(reportMarkerComment({ client: writer(), throwOnError: true, path: { id }, body: { reason } }))
  }, [writer])

  const onReply = useCallback((id: string) => {
    const target = find(id)
    // A reply to a reply answers the thread it is in: the backend allows one level,
    // so aiming at the top-level comment is what the reader means.
    const parent = target?.parentId ? find(target.parentId) : target
    if (parent) setReplyingTo(parent)
  }, [find])

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }),
    [language],
  )

  const items = useMemo((): MarkerComment[] => {
    const view = (row: MarkerCommentRead, reply: boolean): MarkerComment => ({
      id: row.id,
      markerId: row.marker,
      authorName: row.author.name,
      authorAvatarUrl: row.author.avatarUrl,
      createdLabel: dateFormat.format(new Date(row.createdAt)),
      body: row.body,
      attachments: [],
      likeCount: row.likeCount,
      liked: row.liked,
      // A reply's own replyCount is always 0; showing "view replies" under it would
      // offer a thread that cannot exist.
      replyCount: reply ? 0 : row.replyCount,
      mine: viewerUid != null && row.author.uid === viewerUid,
      edited: row.editedAt != null,
      reply,
    })
    return comments.flatMap((row) => [
      view(row, false),
      ...(replies[row.id] ?? []).map((child) => view(child, true)),
    ])
  }, [comments, replies, dateFormat, viewerUid])

  const config: MarkerCommentsConfig = {
    markerId,
    items,
    sort,
    onSortChange: setSort,
    onLike,
    onReply,
    onViewReplies: (id) => {
      void loadReplies(id).catch(() => setError(loadFailedMessage))
    },
    onSubmit,
    submitting,
    onEdit,
    onDelete,
    onReport,
    replyingTo: replyingTo?.author.name,
    onCancelReply: () => setReplyingTo(null),
    allowAttachments: false,
  }

  return { config, loading, error }
}
