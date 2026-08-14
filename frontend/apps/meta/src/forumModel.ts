/**
 * The forum's view model, and the mapping from the wire types onto it.
 *
 * This file exists because the page used to render fixtures whose fields were
 * *locale keys* — `titleKey`, `copyKey`, `tagKeys` — resolved through `t()` at
 * render time. Real posts are rows written by one person in one language, so
 * that indirection cannot survive, and neither can the five helper functions
 * (`postTitle`, `postCopy`, …) that existed only to accept either shape. What
 * replaces them is this: one type, every field already a string, resolved once
 * here instead of at each of the twenty-odd places that rendered a post.
 *
 * Keeping it out of the component also makes it testable without a DOM, which
 * matters most for the parts a reviewer cannot eyeball — that `own` compares
 * uids and not names, and that the tag row keeps its entries distinct.
 */
import type { CommentRead, PostRead, UserPublic } from '@gamemap/api-core'

/** A post as the forum renders it. Every field is display-ready. */
export interface ForumPost {
  /** Permanent post number. Identifies the post everywhere, including the URL. */
  postNo: number
  channel: 'general' | 'official' | 'games'
  title: string
  body: string
  /** Games this post is filed under, as ids — the caller maps them to names. */
  gameIds: string[]
  /** Display labels for the tag row: game names, the topic, then free-form tags. */
  tags: string[]
  topic: string | null

  author: string
  /**
   * The author's permanent uid, as a string.
   *
   * The identity key for following and for profile links. Deliberately not
   * `specialUid`, which the backend documents as display-only and reassignable —
   * linking by it would break a link the moment a vanity number moved.
   */
  authorUid: string
  /** What the profile line shows: the vanity number when there is one. */
  authorNumber: string
  avatarSrc: string

  /** `YYYY-MM-DD`, in the reader's timezone. */
  time: string
  createdAt: string
  editedAt: string | null

  commentCount: number
  likeCount: number
  bookmarkCount: number
  /** The reader's own state, from the server rather than from local storage. */
  liked: boolean
  bookmarked: boolean

  imageSrcs: string[]
  videoUrl: string | null

  featured: boolean
  /** Whether the reader wrote it, which unlocks edit and delete. */
  own: boolean
}

/** A comment or reply as the thread renders it. */
export interface ForumComment {
  id: string
  /** Floor number, or null on a reply — only top-level comments are numbered. */
  commentNo: number | null
  parentId: string | null
  author: string
  authorUid: string
  authorNumber: string
  avatarSrc: string
  body: string
  time: string
  createdAt: string
  editedAt: string | null
  likeCount: number
  liked: boolean
  own: boolean
  /** Replies to this comment, in the order the server returned them. */
  replies: ForumComment[]
}

/**
 * Formats an ISO timestamp as `YYYY-MM-DD` in the reader's own timezone.
 *
 * Built from the local getters rather than slicing the ISO string, because the
 * string is UTC: `toISOString().slice(0, 10)` shows yesterday's date to
 * everyone east of Greenwich for part of every day, which for a Chinese
 * audience is the first eight hours of it.
 */
export function calendarDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** The account number a profile line shows: the vanity one when it exists. */
export function displayNumber(user: Pick<UserPublic, 'uid' | 'specialUid'>): string {
  return String(user.specialUid ?? user.uid)
}

/**
 * How a post's tag row is composed.
 *
 * The row mixes three sources — the games it is filed under, its topic, and the
 * author's free-form tags — and the first two are *ids* that have to become
 * words in the reader's language. The caller supplies the two lookups rather
 * than this module importing i18n, which is also what lets the tests assert the
 * composition without a translation catalog.
 */
export interface TagLabellers {
  gameName(id: string): string
  topicName(topic: string): string
}

/**
 * Builds the tag row, dropping duplicates.
 *
 * Deduplicated because the three sources can collide — a post tagged `guide`
 * whose topic is also `guide` rendered the word twice, and since the label is
 * used as the React key, two identical entries were a duplicate-key warning as
 * well as a visual one. First occurrence wins, so the game and topic labels keep
 * their position ahead of free-form tags.
 */
export function composeTags(
  post: Pick<PostRead, 'gameIds' | 'topic' | 'tags'>,
  labels: TagLabellers,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    const key = trimmed.toLocaleLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(trimmed)
  }

  for (const id of post.gameIds ?? []) push(labels.gameName(id))
  if (post.topic) push(labels.topicName(post.topic))
  for (const tag of post.tags ?? []) push(tag)
  return out
}

/**
 * Maps a post from the wire onto the view model.
 *
 * `viewerUid` is the reader's uid or null when signed out; it decides `own`, and
 * therefore whether the edit and delete controls appear. Comparing uids rather
 * than display names matters — names are neither unique nor stable, so a
 * name comparison would hand one user the edit control on another's post as soon
 * as two accounts shared a name.
 */
export function toForumPost(post: PostRead, labels: TagLabellers, viewerUid: number | null): ForumPost {
  return {
    postNo: post.postNo,
    channel: post.channel,
    title: post.title,
    body: post.body,
    gameIds: post.gameIds ?? [],
    tags: composeTags(post, labels),
    topic: post.topic,

    author: post.author.name,
    authorUid: String(post.author.uid),
    authorNumber: displayNumber(post.author),
    avatarSrc: post.author.avatarUrl,

    time: calendarDate(post.createdAt),
    createdAt: post.createdAt,
    editedAt: post.editedAt,

    commentCount: post.commentCount,
    likeCount: post.likeCount,
    bookmarkCount: post.bookmarkCount,
    liked: post.liked,
    bookmarked: post.bookmarked,

    imageSrcs: (post.images ?? []).map((image) => image.url),
    videoUrl: post.videoUrl,

    featured: post.featuredAt !== null,
    own: viewerUid !== null && post.author.uid === viewerUid,
  }
}

/** Maps one comment, without its replies; `nestComments` assembles the tree. */
function toFlatComment(comment: CommentRead, viewerUid: number | null): ForumComment {
  return {
    id: comment.id,
    commentNo: comment.commentNo,
    parentId: comment.parentId,
    author: comment.author.name,
    authorUid: String(comment.author.uid),
    authorNumber: displayNumber(comment.author),
    avatarSrc: comment.author.avatarUrl,
    body: comment.body,
    time: calendarDate(comment.createdAt),
    createdAt: comment.createdAt,
    editedAt: comment.editedAt,
    likeCount: comment.likeCount,
    liked: comment.liked,
    own: viewerUid !== null && comment.author.uid === viewerUid,
    replies: [],
  }
}

/**
 * Assembles a flat comment page into one level of nesting.
 *
 * The server returns comments and replies in one list, ordered, with a reply
 * carrying its `parentId`. The thread renders two levels — a comment and its
 * replies — so a reply to a reply is attached to the top-level ancestor rather
 * than indented further; the alternative is an unbounded ladder that a phone
 * cannot show. A reply whose parent is not on this page is kept at top level
 * rather than dropped, because losing a comment silently is worse than showing
 * it in the wrong place.
 */
export function nestComments(comments: CommentRead[], viewerUid: number | null): ForumComment[] {
  const byId = new Map<string, ForumComment>()
  for (const comment of comments) byId.set(comment.id, toFlatComment(comment, viewerUid))

  const roots: ForumComment[] = []
  for (const comment of comments) {
    const mapped = byId.get(comment.id)
    if (!mapped) continue
    if (!comment.parentId) {
      roots.push(mapped)
      continue
    }
    // Walk to the top-level ancestor, so a reply-to-a-reply lands beside its
    // siblings instead of nesting a third time. Bounded by the number of
    // comments, and guarded against a cycle the server should never emit.
    let parent = byId.get(comment.parentId)
    const seen = new Set<string>([comment.id])
    while (parent && parent.parentId && !seen.has(parent.id)) {
      seen.add(parent.id)
      parent = byId.get(parent.parentId)
    }
    // Only a comment that really is top-level may take a reply. The loop also
    // exits when it runs into a cycle, and attaching to whatever it stopped on
    // then makes the whole ring unreachable from `roots` — a mutual a→b→a pair
    // rendered as an empty thread rather than as two comments. Falling back to
    // top level keeps every comment on screen, which is the property that
    // matters when the ordering is already wrong.
    if (parent && !parent.parentId) parent.replies.push(mapped)
    else roots.push(mapped)
  }
  return roots
}
