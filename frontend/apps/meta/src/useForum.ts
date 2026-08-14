/**
 * Data hooks for the forum.
 *
 * The page used to derive everything from one in-memory array, so filtering,
 * sorting and paging were all synchronous and a click could not fail. None of
 * that is true against a server, and the three states it introduces — loading,
 * empty, failed — are the ones a reader actually notices. They are modelled here
 * rather than left implicit, because "no posts yet" and "the request failed" look
 * identical if the only state is an empty array, and telling a visitor the forum
 * is empty when the network is down is a lie the UI tells by omission.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiClient } from '@gamemap/api-core'

import { fetchComments, fetchFeed, fetchPost, type FeedQuery } from './forumApi'
import type { ForumComment, ForumPost, TagLabellers } from './forumModel'

type Client = ApiClient['client']

/** What a fetch can be doing. `error` carries a message the page can show. */
export interface AsyncState {
  loading: boolean
  error: string | null
}

export interface FeedState extends AsyncState {
  posts: ForumPost[]
  total: number
  /** Refetches the current query, e.g. after publishing. */
  reload(): void
  /** Replaces one post in place, for an optimistic like or bookmark. */
  patch(postNo: number, changes: Partial<ForumPost>): void
}

/**
 * Fetches a page of the feed, refetching whenever the query changes.
 *
 * A request whose parameters changed while it was in flight is discarded rather
 * than applied. Without that, switching tabs quickly leaves whichever response
 * happened to arrive last on screen, which is not necessarily the tab now
 * selected — the classic out-of-order render that looks like a random bug.
 */
export function useForumFeed(
  client: Client | null,
  query: FeedQuery,
  labels: TagLabellers,
  viewerUid: number | null,
  errorMessage: string,
): FeedState {
  const [posts, setPosts] = useState<ForumPost[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // Serialised so the effect compares by value. The query object is rebuilt on
  // every render, so depending on it directly would refetch forever.
  const key = JSON.stringify({ ...query, viewerUid })
  const latest = useRef(0)

  useEffect(() => {
    if (!client) {
      setPosts([])
      setTotal(0)
      setLoading(false)
      return
    }
    const ticket = ++latest.current
    setLoading(true)
    setError(null)

    void fetchFeed(client, query, labels, viewerUid)
      .then((page) => {
        if (ticket !== latest.current) return
        setPosts(page.posts)
        setTotal(page.total)
        setLoading(false)
      })
      .catch(() => {
        if (ticket !== latest.current) return
        setPosts([])
        setTotal(0)
        setError(errorMessage)
        setLoading(false)
      })
    // `key` stands in for the query's value; labels and errorMessage change
    // identity on every render because they close over `t`, and including them
    // would refetch on each one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const patch = useCallback((postNo: number, changes: Partial<ForumPost>) => {
    setPosts((current) =>
      current.map((post) => (post.postNo === postNo ? { ...post, ...changes } : post)),
    )
  }, [])

  return { posts, total, loading, error, reload, patch }
}

export interface ThreadState extends AsyncState {
  post: ForumPost | null
  comments: ForumComment[]
  /** Total comments on the thread, which can exceed what one page returned. */
  commentTotal: number
  /** How many rows this page actually returned, replies included. */
  commentsLoaded: number
  reload(): void
  patchPost(changes: Partial<ForumPost>): void
  patchComment(id: string, changes: Partial<ForumComment>): void
}

/**
 * Fetches one post and its thread.
 *
 * Fetched rather than read out of the feed, because a post reached by a link or a
 * reload is not on any page the reader has loaded. It also means the detail view
 * shows the current comment count and reaction state rather than whatever the
 * feed request happened to capture.
 */
export function useForumThread(
  client: Client | null,
  postNo: number | null,
  labels: TagLabellers,
  viewerUid: number | null,
  errorMessage: string,
): ThreadState {
  const [post, setPost] = useState<ForumPost | null>(null)
  const [comments, setComments] = useState<ForumComment[]>([])
  const [commentTotal, setCommentTotal] = useState(0)
  const [commentsLoaded, setCommentsLoaded] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const latest = useRef(0)

  useEffect(() => {
    if (!client || postNo === null) {
      setPost(null)
      setComments([])
      setCommentTotal(0)
      setCommentsLoaded(0)
      setLoading(false)
      setError(null)
      return
    }
    const ticket = ++latest.current
    setLoading(true)
    setError(null)

    void Promise.all([
      fetchPost(client, postNo, labels, viewerUid),
      fetchComments(client, postNo, viewerUid),
    ])
      .then(([loadedPost, thread]) => {
        if (ticket !== latest.current) return
        setPost(loadedPost)
        setComments(thread.comments)
        setCommentTotal(thread.total)
        setCommentsLoaded(thread.loaded)
        setLoading(false)
      })
      .catch(() => {
        if (ticket !== latest.current) return
        setPost(null)
        setComments([])
        setCommentTotal(0)
        setCommentsLoaded(0)
        setError(errorMessage)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, postNo, viewerUid, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])
  const patchPost = useCallback((changes: Partial<ForumPost>) => {
    setPost((current) => (current ? { ...current, ...changes } : current))
  }, [])

  // Replies live one level down, so a like on a reply has to be found there too.
  const patchComment = useCallback((id: string, changes: Partial<ForumComment>) => {
    setComments((current) =>
      current.map((comment) => {
        if (comment.id === id) return { ...comment, ...changes }
        if (!comment.replies.some((reply) => reply.id === id)) return comment
        return {
          ...comment,
          replies: comment.replies.map((reply) =>
            reply.id === id ? { ...reply, ...changes } : reply,
          ),
        }
      }),
    )
  }, [])

  return { post, comments, commentTotal, commentsLoaded, loading, error, reload, patchPost, patchComment }
}
