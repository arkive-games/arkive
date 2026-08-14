/**
 * The forum's calls to the backend.
 *
 * A thin layer over the generated operations: it names the requests the page
 * makes, turns wire types into the view model, and translates the page's tabs
 * into the query the API understands. Nothing here holds state or touches the
 * DOM, so each mapping can be tested without rendering anything.
 *
 * Every function takes the client as its first argument rather than reaching for
 * a module-level one. That is what lets the page pass the client the session
 * already uses — see `CoreClient.requestClient` — instead of building a second
 * one that might disagree about the transport.
 */
import {
  bookmarkForumPost,
  createForumComment,
  createForumPost,
  deleteForumComment,
  deleteForumPost,
  followUser,
  getForumPost,
  likeForumComment,
  likeForumPost,
  listForumComments,
  listForumPosts,
  result,
  unbookmarkForumPost,
  unfollowUser,
  unlikeForumComment,
  unlikeForumPost,
  updateForumComment,
  updateForumPost,
  type ApiClient,
} from '@gamemap/api-core'

import {
  nestComments,
  toForumPost,
  type ForumComment,
  type ForumPost,
  type TagLabellers,
} from './forumModel'

type Client = ApiClient['client']

/** How many posts one feed page holds. Server-side now, not a client slice. */
export const POSTS_PER_PAGE = 5

/** How the three feed tabs map onto the API's sort and filter vocabulary. */
export type FeedTab = 'recommended' | 'latest' | 'featured'

export interface FeedQuery {
  tab: FeedTab
  channel?: 'general' | 'official' | 'games'
  gameId?: string
  /** Free text, matched by the server against title and body. */
  query?: string
  /** Narrow to accounts the reader follows. Requires a signed-in reader. */
  followingOnly?: boolean
  /** Only this author's posts, by permanent uid. */
  authorUid?: number
  /**
   * Narrow to what the reader has reacted to — the profile's own tabs.
   *
   * Scoped to the caller server-side and not expressible for anyone else: a
   * bookmark is a private note about what you meant to come back to.
   */
  likedOnly?: boolean
  bookmarkedOnly?: boolean
  page: number
  pageSize?: number
}

export interface FeedPage {
  posts: ForumPost[]
  /** Total matching posts, ignoring pagination — the pager needs it. */
  total: number
}

/**
 * Translates a feed tab into sort and filter parameters.
 *
 * The old client-side ordering for "recommended" was "posts about aion2 first,
 * then fixture order", which was a stand-in for ranking rather than a rule worth
 * keeping. `hot` is the server's ranking; `featured` is the editorial shelf, and
 * it is a filter rather than a sort, so it still needs an order — newest, since a
 * shelf ordered by popularity would freeze on whatever was featured first.
 */
function tabParams(tab: FeedTab): { sort: 'new' | 'hot' | 'top'; featured?: 'true' | 'false' } {
  switch (tab) {
    case 'latest':
      return { sort: 'new' }
    case 'featured':
      return { sort: 'new', featured: 'true' }
    case 'recommended':
    default:
      return { sort: 'hot' }
  }
}

/** Fetches one page of the feed. */
export async function fetchFeed(
  client: Client,
  query: FeedQuery,
  labels: TagLabellers,
  viewerUid: number | null,
): Promise<FeedPage> {
  const { sort, featured } = tabParams(query.tab)
  const page = await result(
    listForumPosts({
      client,
      throwOnError: true,
      query: {
        sort,
        ...(featured ? { featured } : {}),
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.gameId ? { gameId: query.gameId } : {}),
        // Trimmed here as well as on the server, so a query of spaces does not
        // become a filter that matches everything with an empty string.
        ...(query.query?.trim() ? { q: query.query.trim() } : {}),
        ...(query.followingOnly ? { following: true } : {}),
        ...(query.authorUid ? { authorUid: query.authorUid } : {}),
        ...(query.likedOnly ? { liked: true } : {}),
        ...(query.bookmarkedOnly ? { bookmarked: true } : {}),
        page: query.page,
        pageSize: query.pageSize ?? POSTS_PER_PAGE,
      },
    }),
  )
  return {
    posts: (page.results ?? []).map((post) => toForumPost(post, labels, viewerUid)),
    total: page.count,
  }
}

/** Fetches one post by its permanent number. */
export async function fetchPost(
  client: Client,
  postNo: number,
  labels: TagLabellers,
  viewerUid: number | null,
): Promise<ForumPost> {
  const post = await result(getForumPost({ client, throwOnError: true, path: { postNo } }))
  return toForumPost(post, labels, viewerUid)
}

/**
 * Fetches a thread, nested one level deep.
 *
 * The whole thread in one request: the server's default page holds a hundred
 * comments and its ceiling is two hundred, which covers the conversations this
 * forum has. A thread longer than that loses its tail, so this asks for the
 * ceiling and reports the total, letting the caller say so rather than pretend
 * the page is the whole thread.
 */
export async function fetchComments(
  client: Client,
  postNo: number,
  viewerUid: number | null,
): Promise<{ comments: ForumComment[]; total: number; loaded: number }> {
  const page = await result(
    listForumComments({
      client,
      throwOnError: true,
      path: { postNo },
      query: { page: 1, pageSize: 200 },
    }),
  )
  const rows = page.results ?? []
  // `loaded` is the flat row count, and it is what `total` must be compared
  // against. The nested tree holds roots only — replies live inside them — so
  // comparing `total` with the tree's length counted two different things: a
  // thread of two comments and one reply rendered all three and then announced
  // that one more was hidden. Every thread with a reply lied, which is worse than
  // the truncation this figure exists to disclose, because a reader cannot tell
  // the two cases apart.
  return { comments: nestComments(rows, viewerUid), total: page.count, loaded: rows.length }
}

/**
 * The composer's four topics, as the API's enum spells them.
 *
 * Typed as the union rather than `string` so a topic the backend does not accept
 * fails to compile here instead of returning 422 at publish time. The generated
 * enum comes from the same Go constants the server validates against.
 */
export type ForumTopic = 'guide' | 'question' | 'testing' | 'discussion'

export interface CreatePostInput {
  channel: 'general' | 'official' | 'games'
  title: string
  body: string
  topic?: ForumTopic
  gameIds?: string[]
  tags?: string[]
  videoUrl?: string
}

/** Publishes a post and returns it as the feed would show it. */
export async function publishPost(
  client: Client,
  input: CreatePostInput,
  labels: TagLabellers,
  viewerUid: number | null,
): Promise<ForumPost> {
  const post = await result(
    createForumPost({
      client,
      throwOnError: true,
      body: {
        channel: input.channel,
        title: input.title,
        body: input.body,
        ...(input.topic ? { topic: input.topic } : {}),
        ...(input.gameIds?.length ? { gameIds: input.gameIds as never } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
        ...(input.videoUrl ? { videoUrl: input.videoUrl } : {}),
      },
    }),
  )
  return toForumPost(post, labels, viewerUid)
}

/** Applies an edit and returns the updated post. */
export async function editPost(
  client: Client,
  postNo: number,
  body: { title?: string; body?: string; videoUrl?: string | null },
  labels: TagLabellers,
  viewerUid: number | null,
): Promise<ForumPost> {
  const post = await result(
    updateForumPost({
      client,
      throwOnError: true,
      path: { postNo },
      // videoUrl is deliberately forwarded when it is null: null clears the
      // link, while omitting the key leaves it alone. Spreading only truthy
      // values here would make removing a video impossible.
      body: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.videoUrl !== undefined ? { videoUrl: body.videoUrl } : {}),
      },
    }),
  )
  return toForumPost(post, labels, viewerUid)
}

export async function removePost(client: Client, postNo: number): Promise<void> {
  await result(deleteForumPost({ client, throwOnError: true, path: { postNo } }))
}

/** Adds a comment, or a reply when `parentId` is given. */
export async function addComment(
  client: Client,
  postNo: number,
  body: string,
  parentId?: string,
): Promise<void> {
  await result(
    createForumComment({
      client,
      throwOnError: true,
      path: { postNo },
      body: { body, ...(parentId ? { parentId } : {}) },
    }),
  )
}

export async function editComment(client: Client, id: string, body: string): Promise<void> {
  await result(updateForumComment({ client, throwOnError: true, path: { id }, body: { body } }))
}

export async function removeComment(client: Client, id: string): Promise<void> {
  await result(deleteForumComment({ client, throwOnError: true, path: { id } }))
}

/**
 * The toggles.
 *
 * Each takes the state the reader is moving *to*, rather than flipping whatever
 * it finds, so a double click cannot leave the button disagreeing with the
 * server. The endpoints are idempotent for the same reason: liking twice is a
 * PUT twice, which is still one like.
 */
export async function setPostLiked(client: Client, postNo: number, liked: boolean): Promise<void> {
  const op = liked ? likeForumPost : unlikeForumPost
  await result(op({ client, throwOnError: true, path: { postNo } }))
}

export async function setPostBookmarked(
  client: Client,
  postNo: number,
  bookmarked: boolean,
): Promise<void> {
  const op = bookmarked ? bookmarkForumPost : unbookmarkForumPost
  await result(op({ client, throwOnError: true, path: { postNo } }))
}

export async function setCommentLiked(client: Client, id: string, liked: boolean): Promise<void> {
  const op = liked ? likeForumComment : unlikeForumComment
  await result(op({ client, throwOnError: true, path: { id } }))
}

export async function setFollowing(
  client: Client,
  uid: number,
  following: boolean,
): Promise<void> {
  const op = following ? followUser : unfollowUser
  await result(op({ client, throwOnError: true, path: { uid } }))
}
