import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { scrollToResults } from './scrollToResults'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@gamemap/auth'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  POPUP_CLOSE_CONTROL_CLASS,
} from '@gamemap/ui'
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconBookmark,
  IconBold,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconFileText,
  IconGenderFemale,
  IconGenderMale,
  IconH1,
  IconHash,
  IconHeart,
  IconHistory,
  IconHome,
  IconInfoCircle,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconMessageCircle,
  IconMessageReport,
  IconPhoto,
  IconPinFilled,
  IconPencil,
  IconQuote,
  IconSearch,
  IconShare3,
  IconThumbUp,
  IconUnderline,
  IconVideo,
  IconUser,
  IconX,
} from '@tabler/icons-react'
import type { SiteCard } from './sites'
import aion2Logo from './assets/aion2-logo.webp'
import palworldLogo from './assets/palworld-logo.png'
import sts2Logo from './assets/sts2-logo.png'
import vrisingLogo from './assets/vrising-logo.png'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'
import { publicProfileHref } from './userSystemData'
import { useUserSystem, type UserSystemState } from './UserSystemState'
import { getFollowCounts, listFollowing, result, type ApiClient } from '@gamemap/api-core'
import { isForumComposerDirty } from './forumComposerState'
import {
  addComment,
  editPost,
  POSTS_PER_PAGE,
  publishPost,
  removePost,
  setCommentLiked,
  setFollowing,
  setPostBookmarked,
  setPostLiked,
  type FeedQuery,
  type FeedTab,
  type ForumTopic,
} from './forumApi'
import type { ForumComment, ForumPost, TagLabellers } from './forumModel'
import { useForumFeed, useForumThread } from './useForum'
import './forum.css'

type ForumChannel = 'hot' | 'general' | 'official' | 'games'
type ForumMode = 'home' | 'personal' | 'cabin'
type PersonalTab = 'posts' | 'replies' | 'likes' | 'bookmarks'
type CabinTab = 'hot' | 'latest' | 'guides'

const MAX_VISIBLE_PAGES = 5

interface ForumPageProps {
  sites: readonly SiteCard[]
  composerOpen: boolean
  onComingSoon: () => void
  onAuthRequired: () => void
  onComposerDirtyChange: (dirty: boolean) => void
}

type ComposerFocus = 'body' | 'image' | 'video' | 'topic'

/**
 * What the composer hands back on publish.
 *
 * Replaces `LocalForumPost`, which carried an id and a timestamp the client
 * invented because it was writing the row itself. Both now come from the server,
 * so the draft is only what the author actually typed.
 */
interface ComposerDraft {
  channel: 'general' | 'games'
  title: string
  body: string
  topic?: ForumTopic
  gameIds: string[]
  tags: string[]
  videoUrl?: string
}

/**
 * Reads a post's fields.
 *
 * These were five functions that each accepted either a literal string or a
 * locale key, because the fixtures stored `titleKey` and real posts would store
 * `title`. With the fixtures gone there is one shape, so what is left is the
 * plain field access — kept as named helpers only where the call sites read
 * better for it.
 */
function postAuthor(post: ForumPost) {
  return post.author
}

function postTime(post: ForumPost) {
  return post.time
}

function postTitle(post: ForumPost) {
  return post.title
}

function postCopy(post: ForumPost) {
  return post.body
}

function postTags(post: ForumPost) {
  return post.tags
}

const COMPOSER_TOPICS = ['guide', 'question', 'testing', 'discussion'] as const
const FORUM_GAME_MAX_COUNT = 5
const FORUM_TAG_MAX_COUNT = 10

/**
 * Which platform a video URL belongs to, or null.
 *
 * Kept in step with the server's allowlist in `forum/dto.go`, which is the one
 * that decides — this only stops the composer offering to attach something that
 * would be refused. The two lists have to agree; the server's is authoritative
 * because anything here can be bypassed by posting straight at the API.
 */
function forumVideoPlatform(value: string): 'bilibili' | 'douyin' | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname.toLocaleLowerCase()
    if (host === 'b23.tv' || host === 'bilibili.com' || host.endsWith('.bilibili.com')) return 'bilibili'
    if (host === 'douyin.com' || host.endsWith('.douyin.com')) return 'douyin'
    return null
  } catch {
    return null
  }
}


const GAME_LOGOS: Record<string, string> = {
  aion2: aion2Logo,
  palworld: palworldLogo,
  vrising: vrisingLogo,
  sts2: sts2Logo,
}

function getVisiblePageNumbers(currentPage: number, totalPages: number) {
  const windowSize = Math.min(MAX_VISIBLE_PAGES, totalPages)
  const maxStart = Math.max(1, totalPages - windowSize + 1)
  const start = Math.min(
    Math.max(1, currentPage - Math.floor(windowSize / 2)),
    maxStart,
  )

  return Array.from({ length: windowSize }, (_, index) => start + index)
}

export function ForumPage({
  sites,
  composerOpen,
  onComingSoon,
  onAuthRequired,
  onComposerDirtyChange,
}: ForumPageProps) {
  const { t } = useTranslation()
  const auth = useAuth()
  const { status, user, enabled: apiEnabled } = auth
  /**
   * What is left of the local user system on this page.
   *
   * Likes, bookmarks, follows and published posts all used to live in
   * localStorage, which meant they were per-browser and invisible to everyone
   * else — a "like" nobody but you could see. Those now go to the server, so only
   * the profile avatar and the followed-games list are read here.
   */
  const { state: userSystemState, toggleFavoriteGame } = useUserSystem()
  const [channel, setChannel] = useState<ForumChannel>('hot')
  const [feedTab, setFeedTab] = useState<FeedTab>('recommended')
  const [forumMode, setForumMode] = useState<ForumMode>('home')
  const [postReturnMode, setPostReturnMode] = useState<ForumMode>('home')
  const [personalTab, setPersonalTab] = useState<PersonalTab>('posts')
  const [cabinTab, setCabinTab] = useState<CabinTab>('hot')
  const [gameFilter, setGameFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  // The permanent post number, not a fixture id: it is what the API addresses a
  // post by and what a shared link carries.
  const [selectedPostNo, setSelectedPostNo] = useState<number | null>(null)
  const [followingOnly, setFollowingOnly] = useState(false)
  const [composerFocus, setComposerFocus] = useState<ComposerFocus>('body')
  const [publishNotice, setPublishNotice] = useState(false)
  /** A failed mutation, shown to the reader instead of the button doing nothing. */
  const [actionError, setActionError] = useState<string | null>(null)
  /**
   * Which authors the reader follows, by uid.
   *
   * Kept here because the feed rows do not carry it: a post says who wrote it,
   * not whether you follow them, and asking per row would be one request per
   * post. The set is seeded from the follow list once and then maintained by the
   * toggles, so the button state is right without a refetch.
   */
  const [followedUids, setFollowedUids] = useState<ReadonlySet<string>>(new Set())
  const signedIn = status === 'authenticated'
  const currentAvatar = userSystemState.profile.avatarSrc ?? DEFAULT_AVATAR_SRC

  // Keyed by plain string, not by SiteCard['id']. The ids are a closed union now,
  // but the things looked up here are not: a persisted draft or a hash fragment can
  // carry a game this build no longer serves, and `get` already answers that with
  // undefined. Narrowing the key would only force every caller to prove a fact the
  // lookup exists to establish.
  const siteById = useMemo(
    () => new Map<string, SiteCard>(sites.map((site) => [site.id, site])),
    [sites],
  )

  /**
   * How a game id and a topic become words.
   *
   * Passed to the mapper rather than looked up inside it, so the model layer
   * stays free of i18n and can be tested without a catalog. `forum.games.<id>`
   * falls back to the site's own name key, which is the same expression the rest
   * of this page uses for a game label.
   */
  const tagLabels = useMemo(() => ({
    gameName: (id: string) => {
      const site = siteById.get(id)
      return t(`forum.games.${id}`, { defaultValue: site ? t(site.nameKey) : id })
    },
    topicName: (topic: string) => t(`forum.composer.topics.${topic}`, { defaultValue: topic }),
  }), [siteById, t])

  /**
   * The client every forum request goes through.
   *
   * `auth.client.requestClient` rather than a second `createApiClient`, so the
   * feed and the account control cannot end up disagreeing about the transport —
   * which inside a Bilibili Toy would mean every request signed as an anonymous
   * reader while the header showed a signed-in user. Null when no API is
   * configured, which is how a development build with no backend renders an
   * explanatory empty state instead of failing every request.
   */
  const client = apiEnabled ? auth.client.requestClient : null

  /**
   * The reader's own account number, which decides `own` on every post.
   *
   * `user.uid`, and emphatically not `user.id`: the latter is the account UUID,
   * so `Number(user.id)` was NaN and this was null for every signed-in reader.
   * Every fallback then read that as "signed out" — no edit or delete control on
   * your own post, an empty personal feed, follower counts stuck at zero. Silent,
   * total, and invisible to the signed-out browser check I had been running,
   * because null is the correct answer there.
   */
  const viewerUid = user?.uid ?? null

  /**
   * A cabin has its own three tabs, and they select the same three orderings.
   *
   * Mapped rather than ignored: the cabin tablist previously changed only which
   * button was highlighted, because the query read `feedTab` while the buttons set
   * `cabinTab` — so Hot and Latest rendered byte-identical lists. `guides` is the
   * featured shelf for that game, which is what the tab has always meant.
   */
  const cabinFeedTab: FeedTab =
    cabinTab === 'latest' ? 'latest' : cabinTab === 'guides' ? 'featured' : 'recommended'

  const feedQuery = useMemo<FeedQuery>(() => ({
    tab: forumMode === 'cabin' ? cabinFeedTab : feedTab,
    // 'hot' is a view of everything rather than a stored channel, so it sends no
    // channel filter at all.
    channel: channel === 'hot' ? undefined : channel,
    gameId: gameFilter ?? undefined,
    query: submittedQuery,
    // Only meaningful for a signed-in reader; the server would reject it
    // otherwise, and an anonymous visitor who somehow set the toggle should see
    // the ordinary feed rather than an error.
    followingOnly: signedIn && followingOnly,
    page: currentPage,
  }), [cabinFeedTab, channel, currentPage, feedTab, followingOnly, forumMode, gameFilter, signedIn, submittedQuery])

  const feed = useForumFeed(client, feedQuery, tagLabels, viewerUid, t('forum.errors.feed'))

  /**
   * The editorial shelf above the feed.
   *
   * Its own request rather than a slice of the feed: the shelf is not the first
   * three posts of whatever tab is open, and filtering the loaded page for
   * `featured` would leave it empty whenever none of those five happened to be
   * featured. Three because that is what the layout holds — one large card and
   * two beside it.
   */
  const featuredQuery = useMemo<FeedQuery>(
    () => ({ tab: 'featured', page: 1, pageSize: 3 }),
    [],
  )
  const featured = useForumFeed(client, featuredQuery, tagLabels, viewerUid, t('forum.errors.feed'))

  const totalPages = Math.max(1, Math.ceil(feed.total / POSTS_PER_PAGE))
  const feedSectionRef = useRef<HTMLElement>(null)
  // Page changes land on the feed section rather than leaving the reader wherever the
  // pager happened to be, which on a long page is below the first rows of the new page.
  const goToPage = (next: number) => {
    setCurrentPage(next)
    scrollToResults(feedSectionRef.current)
  }
  const activePage = Math.min(currentPage, totalPages)
  const visiblePageNumbers = getVisiblePageNumbers(activePage, totalPages)
  // The server paginates now, so this page *is* the response. Slicing it again
  // would show five of the five posts it already returned, and drop the rest.
  const paginatedPosts = feed.posts

  const thread = useForumThread(client, selectedPostNo, tagLabels, viewerUid, t('forum.errors.post'))
  const selectedPost = thread.post

  /**
   * Which game the right rail is about.
   *
   * The open post's first game when reading one, otherwise the active cabin
   * filter. Computed once because it was previously spelled out four times in
   * the same expression, and one of those copies is how a mismatch starts.
   */
  const sidebarGameId = selectedPost?.gameIds[0] ?? gameFilter ?? ''

  useEffect(() => {
    if (!publishNotice) return
    const timeout = window.setTimeout(() => setPublishNotice(false), 2600)
    return () => window.clearTimeout(timeout)
  }, [publishNotice])

  useEffect(() => {
    if (!actionError) return
    const timeout = window.setTimeout(() => setActionError(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [actionError])

  /**
   * Seeds the follow set once per signed-in reader.
   *
   * One request for the whole list rather than a flag on every post: the feed
   * returns five posts but the reader may follow hundreds of accounts, and the
   * page needs the answer for whichever authors happen to appear. A failure
   * leaves the set empty, which renders every Follow button in its unfollowed
   * state — wrong, but recoverable by clicking, where a thrown error would take
   * the feed down with it.
   */
  useEffect(() => {
    if (!client || viewerUid === null) {
      setFollowedUids(new Set())
      return
    }
    let active = true
    void result(listFollowing({
      client,
      throwOnError: true,
      path: { uid: viewerUid },
      query: { page: 1, pageSize: 200 },
    }))
      .then((page) => {
        if (!active) return
        setFollowedUids(new Set((page.results ?? []).map((entry) => String(entry.user.uid))))
      })
      .catch(() => {
        if (active) setFollowedUids(new Set())
      })
    return () => { active = false }
  }, [client, viewerUid])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmittedQuery(query)
    setCurrentPage(1)
  }

  const openPost = (postNo: number) => {
    setPostReturnMode(forumMode)
    setSelectedPostNo(postNo)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const closePost = () => {
    setSelectedPostNo(null)
    setForumMode(postReturnMode)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const showHome = () => {
    setForumMode('home')
    setChannel('hot')
    setGameFilter(null)
    setSelectedPostNo(null)
    setCurrentPage(1)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  /**
   * "Me" needs a "me", so it asks for sign-in first.
   *
   * Without the gate a signed-out visitor reached a page whose Posts tab dropped
   * its `authorUid` filter — an absent value is omitted from the query string
   * rather than sent as null — and so rendered the whole site's latest twenty
   * posts under a placeholder name, as though they were the reader's own. The
   * profile band above them said 0, because that count was gated and the feed
   * was not, which made the page contradict itself as well as mislead.
   */
  const showPersonal = () => {
    runAuthenticated(() => {
      setForumMode('personal')
      setSelectedPostNo(null)
      window.scrollTo({ top: 0, behavior: 'auto' })
    })
  }

  const showCabin = (gameId: string) => {
    setForumMode('cabin')
    setChannel('games')
    setGameFilter(gameId)
    setSelectedPostNo(null)
    setCurrentPage(1)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  /**
   * Runs a request that changes something, reporting a failure rather than
   * swallowing it.
   *
   * Every mutation on this page used to be a synchronous localStorage write that
   * could not fail. Against a server they can — a session that expired, a post
   * someone else deleted, a network that dropped — and a button that silently
   * does nothing is the worst of the available behaviours. `revert` puts the
   * optimistic change back, so the control ends up agreeing with the server.
   */
  const runMutation = async (action: () => Promise<void>, revert?: () => void) => {
    if (!client) return
    try {
      await action()
    } catch {
      revert?.()
      setActionError(t('forum.errors.action'))
    }
  }

  /**
   * Follows or unfollows, by the author's permanent uid.
   *
   * The uid arrives as a string because it comes off a rendered post; the API
   * takes a number. A value that does not parse is dropped rather than sent,
   * which is what happens for a post whose author has since been removed.
   */
  const toggleFollow = (authorUid: string, following: boolean) => {
    if (!signedIn) {
      onAuthRequired()
      return
    }
    const uid = Number(authorUid)
    if (!Number.isFinite(uid) || uid <= 0) return
    void runMutation(async () => {
      await setFollowing(client!, uid, following)
      setFollowedUids((current) => {
        const next = new Set(current)
        if (following) next.add(authorUid)
        else next.delete(authorUid)
        return next
      })
    })
  }

  const runAuthenticated = (action: () => void) => {
    if (!signedIn) {
      onAuthRequired()
      return
    }
    action()
  }

  const compose = (focus: ComposerFocus = 'body') => {
    setComposerFocus(focus)
    if (window.location.hash !== '#forum/new') window.location.hash = 'forum/new'
  }

  // `replaceState` fires no `hashchange`, and App derives `activeRoute` only from
  // that event -- so without dispatching one the app stays in composer route state
  // after the composer closes. That kept the mobile bottom nav unmounted until the
  // user navigated to a different root route (clicking #forum did nothing, the hash
  // already matched). `replaceState` rather than assignment is deliberate: closing
  // the composer should not add a history entry.
  const returnToForum = () => {
    if (window.location.hash === '#forum') return
    window.history.replaceState(null, '', '#forum')
    window.dispatchEvent(new Event('hashchange'))
  }

  const closeComposer = () => {
    returnToForum()
  }

  /**
   * Publishes a post and opens it.
   *
   * Asynchronous now, so the composer has to know whether it succeeded before it
   * closes. It returns the outcome rather than closing optimistically: a draft
   * discarded on a failed request is a reader's writing lost, which is the one
   * failure here worth designing around.
   *
   * The feed is reloaded rather than patched with the new post. The reader is
   * sent to the post itself, so the list behind them only has to be right the
   * next time they look at it — and a refetch gets that right for every tab and
   * filter, where inserting locally would guess at the ordering the server uses.
   */
  const publish = async (draft: ComposerDraft): Promise<boolean> => {
    if (!client) return false
    try {
      const created = await publishPost(
        client,
        {
          channel: draft.channel,
          title: draft.title,
          body: draft.body,
          topic: draft.topic,
          gameIds: draft.gameIds,
          tags: draft.tags,
          videoUrl: draft.videoUrl,
        },
        tagLabels,
        viewerUid,
      )
      onComposerDirtyChange(false)
      setPublishNotice(true)
      setChannel(created.channel)
      setGameFilter(created.gameIds[0] ?? null)
      setFeedTab('recommended')
      setCurrentPage(1)
      setSelectedPostNo(created.postNo)
      feed.reload()
      returnToForum()
      window.scrollTo({ top: 0, behavior: 'auto' })
      return true
    } catch {
      setActionError(t('forum.errors.publish'))
      return false
    }
  }

  /**
   * Likes or unlikes, updating the count before the request completes.
   *
   * The old code displayed `storedCount + (youToggled ? 1 : 0)`, treating the
   * fixture number as everyone else's and the reader's own click as a local
   * addition. The server now owns the whole count, so the optimistic step adjusts
   * it directly and the revert undoes exactly that.
   */
  /**
   * `patch` names the list the card being clicked actually belongs to.
   *
   * The personal view renders its own feed, so patching the page-level one left
   * the heart on screen untouched — the request succeeded and the button looked
   * dead until a reload. Taking the patcher as an argument makes the caller say
   * which list it is showing, rather than this function assuming there is only
   * one. It defaults to the main feed because that is the common case.
   */
  const togglePostLike = (post: ForumPost, patch: (postNo: number, changes: Partial<ForumPost>) => void = feed.patch) => {
    runAuthenticated(() => {
      const liked = !post.liked
      const delta = liked ? 1 : -1
      const changes = { liked, likeCount: post.likeCount + delta }
      const undo = { liked: post.liked, likeCount: post.likeCount }
      patch(post.postNo, changes)
      if (selectedPost?.postNo === post.postNo) thread.patchPost(changes)
      void runMutation(
        () => setPostLiked(client!, post.postNo, liked),
        () => {
          patch(post.postNo, undo)
          if (selectedPost?.postNo === post.postNo) thread.patchPost(undo)
        },
      )
    })
  }

  const togglePostBookmark = (post: ForumPost, patch: (postNo: number, changes: Partial<ForumPost>) => void = feed.patch) => {
    runAuthenticated(() => {
      const bookmarked = !post.bookmarked
      const delta = bookmarked ? 1 : -1
      const changes = { bookmarked, bookmarkCount: post.bookmarkCount + delta }
      const undo = { bookmarked: post.bookmarked, bookmarkCount: post.bookmarkCount }
      patch(post.postNo, changes)
      if (selectedPost?.postNo === post.postNo) thread.patchPost(changes)
      void runMutation(
        () => setPostBookmarked(client!, post.postNo, bookmarked),
        () => {
          patch(post.postNo, undo)
          if (selectedPost?.postNo === post.postNo) thread.patchPost(undo)
        },
      )
    })
  }

  const toggleCommentLike = (comment: ForumComment) => {
    runAuthenticated(() => {
      const liked = !comment.liked
      const changes = { liked, likeCount: comment.likeCount + (liked ? 1 : -1) }
      thread.patchComment(comment.id, changes)
      void runMutation(
        () => setCommentLiked(client!, comment.id, liked),
        () => thread.patchComment(comment.id, { liked: comment.liked, likeCount: comment.likeCount }),
      )
    })
  }

  /** Adds a comment or a reply, then refetches so floor numbers stay the server's. */
  const submitComment = async (body: string, parentId?: string): Promise<boolean> => {
    if (!client || selectedPostNo === null) return false
    try {
      await addComment(client, selectedPostNo, body, parentId)
      thread.reload()
      feed.patch(selectedPostNo, { commentCount: (selectedPost?.commentCount ?? 0) + 1 })
      return true
    } catch {
      setActionError(t('forum.errors.comment'))
      return false
    }
  }

  const deleteOwnPost = (post: ForumPost) => {
    runAuthenticated(() => {
      void runMutation(async () => {
        await removePost(client!, post.postNo)
        setSelectedPostNo(null)
        setForumMode(postReturnMode)
        feed.reload()
      })
    })
  }

  const saveOwnPost = async (post: ForumPost, title: string, body: string): Promise<boolean> => {
    if (!client) return false
    try {
      const updated = await editPost(client, post.postNo, { title, body }, tagLabels, viewerUid)
      thread.patchPost(updated)
      feed.patch(post.postNo, updated)
      return true
    } catch {
      setActionError(t('forum.errors.action'))
      return false
    }
  }

  const renderSearch = (placementClass: string) => (
    <form className={`forum-search ${placementClass}`} role="search" onSubmit={submitSearch}>
      <IconSearch className="size-5" stroke={1.8} aria-hidden="true" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={t('forum.search.placeholder')}
        placeholder={t('forum.search.placeholder')}
      />
      <button type="submit"><IconSearch className="size-5" stroke={1.8} aria-hidden="true" /><span>{t('forum.search.action')}</span></button>
    </form>
  )

  if (composerOpen) {
    return (
      <>
        <main className="forum-main forum-publish-main">
          <ForumComposerPage
            focus={composerFocus}
            sites={sites}
            initialGameId={gameFilter}
            avatarSrc={currentAvatar}
            authorName={user?.name ?? t('forum.composer.guest')}
            signedIn={signedIn}
            onAuthRequired={onAuthRequired}
            onImageUnavailable={onComingSoon}
            onDirtyChange={onComposerDirtyChange}
            onCancel={closeComposer}
            onPublish={publish}
          />
        </main>
        {publishNotice && (
          <div className="forum-publish-toast" role="status">
            <IconCheck className="size-5" stroke={2} aria-hidden="true" />
            {t('forum.composer.submitted')}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <main className="forum-main">
      <div className="forum-shell">
        <aside className="forum-left-rail forum-navigation-rail" aria-label={t('forum.redesign.navigation')}>
          <nav className="forum-primary-navigation">
            <button type="button" className={forumMode === 'home' && !selectedPost ? 'is-active' : undefined} onClick={showHome}>
              <IconHome className="size-5" stroke={1.8} aria-hidden="true" />
              <span>{t('forum.redesign.home')}</span>
            </button>
            <button type="button" onClick={() => compose('body')}>
              <IconPencil className="size-5" stroke={1.8} aria-hidden="true" />
              <span>{t('forum.redesign.compose')}</span>
            </button>
            <button type="button" className={forumMode === 'personal' && !selectedPost ? 'is-active' : undefined} onClick={showPersonal}>
              <IconUser className="size-5" stroke={1.8} aria-hidden="true" />
              <span>{t('forum.redesign.mine')}</span>
            </button>
          </nav>

          <section className="forum-followed-cabins" aria-labelledby="forum-followed-cabins-heading">
            <header>
              <h2 id="forum-followed-cabins-heading">{t('forum.redesign.followedCabins')}</h2>
              <span>{sites.length}</span>
            </header>
            <div>
              {sites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  className={forumMode === 'cabin' && gameFilter === site.id && !selectedPost ? 'is-active' : undefined}
                  onClick={() => showCabin(site.id)}
                >
                  <span className="forum-game-logo" aria-hidden="true"><img src={GAME_LOGOS[site.id]} alt="" /></span>
                  <span>
                    <strong>{t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })}</strong>
                    <small>{t('forum.redesign.updatedRecently')}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <nav className="forum-information-navigation" aria-label={t('forum.redesign.arkiveInfo')}>
            <h2>{t('forum.redesign.arkiveInfo')}</h2>
            <button type="button" onClick={onComingSoon}><IconHistory className="size-5" stroke={1.8} aria-hidden="true" />{t('forum.redesign.changelog')}</button>
            <button type="button" onClick={onComingSoon}><IconMessageReport className="size-5" stroke={1.8} aria-hidden="true" />{t('forum.redesign.feedback')}</button>
            <button type="button" onClick={onComingSoon}><IconInfoCircle className="size-5" stroke={1.8} aria-hidden="true" />{t('forum.redesign.guidelines')}</button>
          </nav>
        </aside>

        <section className="forum-content-column">
          {!selectedPost && (
            <div className="forum-mobile-forum-tools">
              {renderSearch('forum-mobile-search')}
              <nav className="forum-mobile-cabins" aria-label={t('forum.redesign.followedCabins')}>
                {sites.map((site) => (
                  <button key={site.id} type="button" onClick={() => showCabin(site.id)}>
                    <span className="forum-game-logo" aria-hidden="true"><img src={GAME_LOGOS[site.id]} alt="" /></span>
                    {t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })}
                  </button>
                ))}
              </nav>
            </div>
          )}
          {selectedPost ? (
            <ForumPostDetail
              post={selectedPost}
              comments={thread.comments}
              commentTotal={thread.commentTotal}
              commentsLoaded={thread.commentsLoaded}
              loading={thread.loading}
              error={thread.error}
              followed={followedUids.has(selectedPost.authorUid)}
              // The game's cover art stands in when a post has no image of its
              // own, but never on the reader's own post: seeing a stock picture
              // attached to something you wrote reads as an image you did not
              // choose rather than as decoration.
              images={selectedPost.imageSrcs.length
                ? selectedPost.imageSrcs
                : [!selectedPost.own && selectedPost.gameIds[0]
                    ? siteById.get(selectedPost.gameIds[0])?.bg
                    : undefined].filter((image): image is string => Boolean(image))}
              onBack={closePost}
              onComingSoon={onComingSoon}
              onAuthRequired={onAuthRequired}
              currentAvatar={currentAvatar}
              onToggleLike={() => togglePostLike(selectedPost)}
              onToggleBookmark={() => togglePostBookmark(selectedPost)}
              onToggleFollow={() => toggleFollow(selectedPost.authorUid, !followedUids.has(selectedPost.authorUid))}
              onToggleCommentLike={toggleCommentLike}
              onSubmitComment={submitComment}
              onDeletePost={() => deleteOwnPost(selectedPost)}
              onSavePost={(title, body) => saveOwnPost(selectedPost, title, body)}
              signedIn={signedIn}
            />
          ) : forumMode === 'personal' ? (
            <ForumPersonalView
              avatarSrc={currentAvatar}
              name={user?.name ?? t('userSystem.currentUser.name')}
              accountId={user?.id ?? ''}
              bio={userSystemState.profile.bio || t('userSystem.currentUser.bio')}
              gender={userSystemState.profile.gender}
              tab={personalTab}
              viewerUid={viewerUid}
              client={client}
              labels={tagLabels}
              siteById={siteById}
              followedUids={followedUids}
              onTabChange={setPersonalTab}
              onToggleFollow={toggleFollow}
              onOpenPost={openPost}
              onComingSoon={onComingSoon}
              onToggleBookmark={togglePostBookmark}
              onToggleLike={togglePostLike}
            />
          ) : forumMode === 'cabin' && gameFilter && siteById.get(gameFilter) ? (
            <ForumCabinView
              site={siteById.get(gameFilter)!}
              tab={cabinTab}
              posts={feed.posts}
              loading={feed.loading}
              followedUids={followedUids}
              onTabChange={setCabinTab}
              onOpenPost={openPost}
              onToggleFollow={toggleFollow}
              onToggleBookmark={togglePostBookmark}
              onToggleLike={togglePostLike}
              onComingSoon={onComingSoon}
            />
          ) : (
            <>
              {/* The editorial shelf, which is what `featured` means on a post.
                  These three cards used to be locale strings — an invented title,
                  author and date each, rendered in the layout real posts get, so a
                  visitor had no way to tell them from the feed below. The section
                  is absent entirely when nothing is featured, rather than falling
                  back to something written to fill the space. */}
              {featured.posts.length > 0 && (
                <section className="forum-pinned-section">
                  <div className="forum-pinned-grid">
                    {featured.posts.slice(0, 1).map((post) => (
                      <article key={post.postNo} className="forum-pinned-feature">
                        <img
                          src={post.imageSrcs[0] ?? (post.gameIds[0] ? siteById.get(post.gameIds[0])?.bg : undefined)}
                          alt=""
                          aria-hidden="true"
                        />
                        <span className="forum-pinned-shade" aria-hidden="true" />
                        <div>
                          <span className="forum-pin-label">
                            <IconPinFilled className="size-4" stroke={1.8} aria-hidden="true" />
                            {post.gameIds[0]
                              ? t(`forum.games.${post.gameIds[0]}`, { defaultValue: post.gameIds[0] })
                              : t('forum.feed.featured')}
                          </span>
                          <h3>
                            <button type="button" onClick={() => openPost(post.postNo)}>{post.title}</button>
                          </h3>
                          <p>{post.body}</p>
                          <small>{t('forum.detail.byline', { time: post.time })}</small>
                        </div>
                      </article>
                    ))}

                    <div className="forum-pinned-list">
                      {featured.posts.slice(1, 3).map((post) => (
                        <article key={post.postNo}>
                          <span>
                            {post.gameIds[0]
                              ? t(`forum.games.${post.gameIds[0]}`, { defaultValue: post.gameIds[0] })
                              : t('forum.feed.featured')}
                          </span>
                          <h3>
                            <button type="button" onClick={() => openPost(post.postNo)}>{post.title}</button>
                          </h3>
                          <small>{t('forum.detail.byline', { time: post.time })}</small>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              <section className="forum-feed-section" ref={feedSectionRef}>
            <div className="forum-panel forum-feed-panel">
              <div className="forum-feed-toolbar">
                <div role="tablist" aria-label={t('forum.feed.tabsLabel')}>
                  {(['recommended', 'latest', 'featured'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={feedTab === tab}
                      className={feedTab === tab ? 'is-active' : undefined}
                      onClick={() => {
                        setFeedTab(tab)
                        setCurrentPage(1)
                      }}
                    >
                      {t(`forum.feed.${tab}`)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className={followingOnly ? 'forum-following-filter is-active' : 'forum-following-filter'}
                  aria-pressed={followingOnly}
                  onClick={() => runAuthenticated(() => {
                    setFollowingOnly((current) => !current)
                    setCurrentPage(1)
                  })}
                >
                  <IconAdjustmentsHorizontal className="size-4" stroke={1.8} aria-hidden="true" />
                  {t('forum.feed.followingOnly')}
                </button>
              </div>

              {feed.loading ? (
                <p className="forum-feed-status" role="status">{t('forum.loading')}</p>
              ) : feed.error ? (
                // A failure and an empty forum are different things, and an
                // empty array cannot tell them apart. Saying "no posts" when the
                // request failed is a lie the UI would tell by omission.
                <p className="forum-feed-status is-error" role="alert">{feed.error}</p>
              ) : feed.posts.length > 0 ? (
                <>
                  <div className="forum-post-list">
                    {paginatedPosts.map((post) => (
                      <ForumPostCard
                        key={post.postNo}
                        post={post}
                        image={post.imageSrcs[0] ?? (!post.own && post.gameIds[0]
                          ? siteById.get(post.gameIds[0])?.bg
                          : undefined)}
                        followed={followedUids.has(post.authorUid)}
                        bookmarked={post.bookmarked}
                        liked={post.liked}
                        onToggleFollow={() => toggleFollow(post.authorUid, !followedUids.has(post.authorUid))}
                        onToggleBookmark={() => togglePostBookmark(post)}
                        onToggleLike={() => togglePostLike(post)}
                        onOpen={() => openPost(post.postNo)}
                        onShare={onComingSoon}
                      />
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <nav className="forum-pagination" aria-label={t('forum.pagination.label')}>
                      <button
                        type="button"
                        aria-label={t('forum.pagination.previous')}
                        disabled={activePage === 1}
                        onClick={() => goToPage(Math.max(1, activePage - 1))}
                      >
                        <IconChevronLeft className="size-4" stroke={1.8} aria-hidden="true" />
                        <span className="forum-pagination-label">{t('forum.pagination.previous')}</span>
                      </button>
                      {visiblePageNumbers.map((page) => (
                        <button
                          key={page}
                          type="button"
                          className={activePage === page ? 'is-active' : undefined}
                          aria-current={activePage === page ? 'page' : undefined}
                          aria-label={t('forum.pagination.page', { page })}
                          onClick={() => goToPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label={t('forum.pagination.next')}
                        disabled={activePage === totalPages}
                        onClick={() => goToPage(Math.min(totalPages, activePage + 1))}
                      >
                        <span className="forum-pagination-label">{t('forum.pagination.next')}</span>
                        <IconChevronRight className="size-4" stroke={1.8} aria-hidden="true" />
                      </button>
                    </nav>
                  )}
                </>
              ) : (
                <div className="forum-empty" role="status">
                  <IconSearch className="size-8" stroke={1.5} aria-hidden="true" />
                  <strong>{t('forum.empty.title')}</strong>
                  <p>{t('forum.empty.description')}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('')
                      setSubmittedQuery('')
                      setChannel('hot')
                      setGameFilter(null)
                      setFeedTab('recommended')
                      setCurrentPage(1)
                    }}
                  >
                    {t('forum.empty.action')}
                  </button>
                </div>
              )}
            </div>
              </section>
            </>
          )}
          {!selectedPost && forumMode !== 'cabin' && (
            <ForumMobileDiscovery sites={sites} posts={feed.posts} onOpenPost={openPost} onOpenCabin={showCabin} />
          )}
        </section>

        <aside className="forum-right-rail" aria-label={t('forum.sidebar.label')}>
          {renderSearch('forum-right-search')}
          {(forumMode === 'cabin' || sidebarGameId) && siteById.get(sidebarGameId) ? (
            <ForumCabinSidebar
              site={siteById.get(sidebarGameId)!}
              followed={userSystemState.favoriteGameIds.includes(sidebarGameId)}
              onToggleFollow={() => runAuthenticated(() => toggleFavoriteGame(sidebarGameId))}
            />
          ) : (
            <>
              <ForumHotPosts posts={feed.posts} onOpenPost={openPost} onComingSoon={onComingSoon} />
              <section className="forum-panel forum-popular-games">
                <header><h2>{t('forum.redesign.popularGames')}</h2><button type="button" onClick={onComingSoon}>{t('forum.redesign.allGames')}</button></header>
                {sites.slice(0, 3).map((site) => (
                  <button key={site.id} type="button" onClick={() => showCabin(site.id)}>
                    <span className="forum-game-logo" aria-hidden="true"><img src={GAME_LOGOS[site.id]} alt="" /></span>
                    <span><strong>{t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })}</strong></span>
                    <IconChevronRight className="size-4" stroke={1.8} aria-hidden="true" />
                  </button>
                ))}
              </section>

              {/* "Recommended users" is gone rather than ported. It listed four
                  invented people — name, one-line bio and a pravatar.cc portrait
                  each — and its Follow button would have posted a uid that does
                  not exist, so against real data it was broken as well as untrue.
                  Recommending accounts needs a signal the backend does not have
                  yet (who posts, who you already follow, who they follow); when
                  it does, this comes back reading from it. */}
            </>
          )}
        </aside>
      </div>
      </main>
      {!composerOpen && (
        <nav className="forum-mobile-bottom-navigation" aria-label={t('forum.redesign.navigation')}>
          <button type="button" className={forumMode === 'home' && !selectedPost ? 'is-active' : undefined} onClick={showHome}><IconHome className="size-5" stroke={1.8} /><span>{t('forum.redesign.home')}</span></button>
          <button type="button" onClick={() => compose('body')}><IconPencil className="size-5" stroke={1.8} /><span>{t('forum.redesign.compose')}</span></button>
          <button type="button" className={forumMode === 'personal' && !selectedPost ? 'is-active' : undefined} onClick={showPersonal}><IconUser className="size-5" stroke={1.8} /><span>{t('forum.redesign.mine')}</span></button>
        </nav>
      )}
      {publishNotice && (
        <div className="forum-publish-toast" role="status">
          <IconCheck className="size-5" stroke={2} aria-hidden="true" />
          {t('forum.composer.submitted')}
        </div>
      )}
    </>
  )
}

function ForumPersonalView({
  avatarSrc,
  name,
  accountId,
  bio,
  gender,
  tab,
  viewerUid,
  client,
  labels,
  siteById,
  followedUids,
  onTabChange,
  onOpenPost,
  onComingSoon,
  onToggleBookmark,
  onToggleLike,
  onToggleFollow,
}: {
  avatarSrc: string
  name: string
  accountId: string
  bio: string
  gender: UserSystemState['profile']['gender']
  tab: PersonalTab
  viewerUid: number | null
  client: ApiClient['client'] | null
  labels: TagLabellers
  siteById: ReadonlyMap<string, SiteCard>
  followedUids: ReadonlySet<string>
  onTabChange: (tab: PersonalTab) => void
  onToggleFollow: (authorUid: string, following: boolean) => void
  onOpenPost: (postNo: number) => void
  onComingSoon: () => void
  onToggleBookmark: (post: ForumPost, patch: (postNo: number, changes: Partial<ForumPost>) => void) => void
  onToggleLike: (post: ForumPost, patch: (postNo: number, changes: Partial<ForumPost>) => void) => void
}) {
  const { t, i18n } = useTranslation()

  /**
   * Each tab is its own server query rather than a filter over one loaded list.
   *
   * "Posts you liked" cannot be computed from the posts on screen — the ones you
   * liked are mostly written by other people and are not in your own feed at all.
   * The old code filtered a combined array, which is why the tab only ever found
   * likes on the handful of posts that happened to be loaded.
   *
   * The replies tab has no query yet: listing a person's comments is an endpoint
   * the backend does not have. It rendered an empty list before this change too,
   * so nothing regressed — it is simply still to build.
   */
  const personalQuery = useMemo<FeedQuery>(() => ({
    tab: 'latest',
    authorUid: tab === 'posts' && viewerUid !== null ? viewerUid : undefined,
    likedOnly: tab === 'likes',
    bookmarkedOnly: tab === 'bookmarks',
    page: 1,
    pageSize: 20,
  }), [tab, viewerUid])

  const personalFeed = useForumFeed(
    // Two reasons to ask for nothing. The replies tab has no query to make, and a
    // reader with no uid has no "own" anything — the Posts tab's author filter
    // would simply be omitted, turning "your posts" into everyone's. Belt and
    // braces with the sign-in gate on the navigation: this view is reachable by
    // hash, so it cannot rely on the button being the only way in.
    tab === 'replies' || viewerUid === null ? null : client,
    personalQuery,
    labels,
    viewerUid,
    t('forum.errors.feed'),
  )
  const visiblePosts = personalFeed.posts

  /**
   * The reader's own post count, independent of which tab is open.
   *
   * A second small request rather than reading `personalFeed.total`, which is the
   * total for the *current* tab: taking it from there made the "Posts" stat read
   * 0 the moment you clicked Likes, so an author with forty posts saw that they
   * had none. `pageSize: 1` because only the count is wanted.
   */
  const ownPostsQuery = useMemo<FeedQuery>(() => ({
    tab: 'latest',
    authorUid: viewerUid ?? undefined,
    page: 1,
    pageSize: 1,
  }), [viewerUid])
  const ownPosts = useForumFeed(
    viewerUid === null ? null : client,
    ownPostsQuery,
    labels,
    viewerUid,
    t('forum.errors.feed'),
  )

  /**
   * The reader's follower and following counts.
   *
   * Both were literals — 46 and 112 — identical for every account, which is the
   * kind of number that reads as real until you notice two profiles share it.
   * Zero is the honest starting value while the request is in flight or after it
   * fails; the alternative is showing a made-up figure that never corrects.
   */
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 })
  useEffect(() => {
    if (!client || viewerUid === null) {
      setFollowCounts({ followers: 0, following: 0 })
      return
    }
    let active = true
    void result(getFollowCounts({ client, throwOnError: true, path: { uid: viewerUid } }))
      .then((counts) => {
        if (!active) return
        // Both tallies are nullable: a privacy setting can withhold them, and
        // `following` on this response is the reader's own follow *state*, not a
        // count. Reading it as one would print "1" or "0" under "Following".
        setFollowCounts({
          followers: counts.followerCount ?? 0,
          following: counts.followingCount ?? 0,
        })
      })
      .catch(() => {
        if (active) setFollowCounts({ followers: 0, following: 0 })
      })
    return () => { active = false }
  }, [client, viewerUid])
  const formatCount = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language).format

  return (
    <div className="forum-personal-view">
      <section className="forum-profile-band">
        <img src={avatarSrc} alt="" />
        <div className="forum-profile-copy">
          <h1>{name}</h1>
          <div className="forum-profile-identity">
            {gender === 'female' && <span title={t('forum.redesign.female')}><IconGenderFemale className="size-4" stroke={2} aria-hidden="true" /><span className="sr-only">{t('forum.redesign.female')}</span></span>}
            {gender === 'male' && <span title={t('forum.redesign.male')}><IconGenderMale className="size-4" stroke={2} aria-hidden="true" /><span className="sr-only">{t('forum.redesign.male')}</span></span>}
            <span>{t('forum.redesign.uid', { id: accountId })}</span>
          </div>
          <p>{bio}</p>
        </div>
        <dl>
          {/* Every figure here is a server total, and none of them move when you
              change tabs. "Likes received" is gone: it summed whatever the current
              tab had loaded, so on the Likes and Bookmarks tabs it added up the
              likes on *other people's* posts — save one post with 400 likes and
              your own profile claimed you had received 400. Summing only your own
              loaded posts would still be a page rather than a total, so this needs
              a server-side aggregate the backend does not expose yet. A number
              that changes as you click looks computed, which makes a wrong one
              worse than the literal it replaced. */}
          <div><dt>{t('forum.redesign.posts')}</dt><dd>{formatCount(ownPosts.total)}</dd></div>
          <div><dt>{t('forum.redesign.following')}</dt><dd>{formatCount(followCounts.following)}</dd></div>
          <div><dt>{t('forum.redesign.followers')}</dt><dd>{formatCount(followCounts.followers)}</dd></div>
        </dl>
        <a href="#account/edit">{t('forum.redesign.editProfile')}</a>
      </section>

      <section className="forum-panel forum-personal-feed">
        <div className="forum-personal-tabs" role="tablist" aria-label={t('forum.redesign.personalContent')}>
          {/* Only the open tab has a count. Showing one on each would mean three
              more requests on every visit to answer a number nobody has asked
              for yet; the old code showed the length of a locally filtered array,
              which was not the real total either. */}
          {(['posts', 'replies', 'likes', 'bookmarks'] as const).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : undefined} onClick={() => onTabChange(item)}>
              {t(`forum.redesign.personalTabs.${item}`)}
              {tab === item && <span>{formatCount(personalFeed.total)}</span>}
            </button>
          ))}
        </div>
        {personalFeed.loading ? (
          <p className="forum-feed-status" role="status">{t('forum.loading')}</p>
        ) : personalFeed.error ? (
          <p className="forum-feed-status is-error" role="alert">{personalFeed.error}</p>
        ) : visiblePosts.length > 0 ? visiblePosts.map((post) => (
          <ForumPostCard
            key={post.postNo}
            post={post}
            image={post.imageSrcs[0] ?? (post.gameIds[0] ? siteById.get(post.gameIds[0])?.bg : undefined)}
            followed={followedUids.has(post.authorUid)}
            bookmarked={post.bookmarked}
            liked={post.liked}
            onToggleFollow={() => onToggleFollow(post.authorUid, !followedUids.has(post.authorUid))}
            onToggleBookmark={() => onToggleBookmark(post, personalFeed.patch)}
            onToggleLike={() => onToggleLike(post, personalFeed.patch)}
            onOpen={() => onOpenPost(post.postNo)}
            onShare={onComingSoon}
          />
        )) : (
          <div className="forum-empty" role="status">
            <IconFileText className="size-8" stroke={1.5} aria-hidden="true" />
            <strong>{t(`forum.redesign.personalEmpty.${tab}`)}</strong>
            <p>{t('forum.redesign.personalEmpty.description')}</p>
          </div>
        )}
      </section>
    </div>
  )
}

function ForumCabinView({
  site,
  tab,
  posts,
  loading,
  followedUids,
  onTabChange,
  onOpenPost,
  onToggleFollow,
  onToggleBookmark,
  onToggleLike,
  onComingSoon,
}: {
  site: SiteCard
  tab: CabinTab
  posts: ForumPost[]
  loading: boolean
  followedUids: ReadonlySet<string>
  onTabChange: (tab: CabinTab) => void
  onOpenPost: (postNo: number) => void
  onToggleFollow: (authorUid: string, following: boolean) => void
  onToggleBookmark: (post: ForumPost) => void
  onToggleLike: (post: ForumPost) => void
  onComingSoon: () => void
}) {
  const { t } = useTranslation()
  /**
   * All three cabin tabs are the query now, so nothing narrows here.
   *
   * Two things were wrong before. `latest` was `[...posts].reverse()`, which
   * reversed *the page* rather than the ordering — on page two that showed the
   * same five posts backwards instead of the five before them. And the tablist set
   * `cabinTab` while the query read `feedTab`, so Hot and Latest fetched the same
   * rows and only the highlight moved. `cabinFeedTab` maps the three tabs onto the
   * three orderings, which leaves this as the page the server returned; filtering
   * for `featured` here as well would apply it twice, and on the guides tab that
   * is already all the server sent.
   */
  const visiblePosts = posts
  /**
   * The cabin's pinned post.
   *
   * Read from the page, which is correct on the guides tab and best-effort on the
   * other two — a featured post outside the first page will not appear until the
   * shelf gets a request of its own, the way the home page's did.
   */
  const pinned = posts.find((post) => post.featured) ?? null

  return (
    <div className="forum-cabin-view">
      <section className="forum-cabin-banner">
        <img src={site.bg} alt="" aria-hidden="true" />
        <span aria-hidden="true" />
        <div>
          <span className="forum-cabin-logo"><img src={GAME_LOGOS[site.id]} alt="" /></span>
          <div><h1>{t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })}</h1></div>
        </div>
      </section>
      <div className="forum-cabin-tabs" role="tablist" aria-label={t('forum.redesign.cabinContent')}>
        {(['hot', 'latest', 'guides'] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : undefined} onClick={() => onTabChange(item)}>{t(`forum.redesign.cabinTabs.${item}`)}</button>
        ))}
      </div>
      {/* The cabin's own pinned strip, which named a fixture post regardless of
          which game you were looking at. It shows this cabin's featured post
          when there is one, and is absent otherwise rather than pinning
          something arbitrary. */}
      {pinned && (
        <section className="forum-cabin-pinned">
          <span>{t('forum.pinned.title')}</span>
          <div><strong>{pinned.title}</strong><p>{t('forum.detail.byline', { time: pinned.time })}</p></div>
          <button type="button" onClick={() => onOpenPost(pinned.postNo)}>{t('forum.pinned.viewAll')}<IconChevronRight className="size-4" stroke={1.8} /></button>
        </section>
      )}
      <section className="forum-panel forum-cabin-feed">
        {loading ? (
          <p className="forum-feed-status" role="status">{t('forum.loading')}</p>
        ) : visiblePosts.length > 0 ? visiblePosts.map((post) => (
          <ForumPostCard
            key={post.postNo}
            post={post}
            image={post.imageSrcs[0] ?? site.bg}
            followed={followedUids.has(post.authorUid)}
            bookmarked={post.bookmarked}
            liked={post.liked}
            onToggleFollow={() => onToggleFollow(post.authorUid, !followedUids.has(post.authorUid))}
            onToggleBookmark={() => onToggleBookmark(post)}
            onToggleLike={() => onToggleLike(post)}
            onOpen={() => onOpenPost(post.postNo)}
            onShare={onComingSoon}
          />
        )) : <div className="forum-empty"><strong>{t('forum.empty.title')}</strong><p>{t('forum.empty.description')}</p></div>}
      </section>
    </div>
  )
}

function ForumHotPosts({ posts, onOpenPost, onComingSoon }: { posts: ForumPost[]; onOpenPost: (postNo: number) => void; onComingSoon: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="forum-panel forum-hot-posts">
      <header><h2>{t('forum.redesign.hotPosts')}</h2><button type="button" onClick={onComingSoon}>{t('forum.redesign.viewAll')}</button></header>
      <ol>{posts.slice(0, 5).map((post, index) => <li key={post.postNo}><button type="button" onClick={() => onOpenPost(post.postNo)}><b>{index + 1}</b><span>{postTitle(post)}</span><small>{post.likeCount}</small></button></li>)}</ol>
    </section>
  )
}

function ForumMobileDiscovery({
  sites,
  posts,
  onOpenPost,
  onOpenCabin,
}: {
  sites: readonly SiteCard[]
  posts: ForumPost[]
  onOpenPost: (postNo: number) => void
  onOpenCabin: (gameId: string) => void
}) {
  const { t } = useTranslation()
  return (
    <details className="forum-mobile-discovery">
      <summary>{t('forum.redesign.communityDiscovery')}<IconChevronRight className="size-4" stroke={1.8} /></summary>
      <section><h2>{t('forum.redesign.hotPosts')}</h2>{posts.slice(0, 3).map((post, index) => <button key={post.postNo} type="button" onClick={() => onOpenPost(post.postNo)}><b>{index + 1}</b><span>{postTitle(post)}</span></button>)}</section>
      <section><h2>{t('forum.redesign.popularGames')}</h2>{sites.slice(0, 3).map((site) => <button key={site.id} type="button" onClick={() => onOpenCabin(site.id)}><span>{t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })}</span></button>)}</section>
    </details>
  )
}

function ForumCabinSidebar({
  site,
  followed,
  onToggleFollow,
}: {
  site: SiteCard
  followed: boolean
  onToggleFollow: () => void
}) {
  const { t } = useTranslation()
  const name = t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })
  return (
    <>
      <section className="forum-panel forum-cabin-summary">
        {/* The follower count here was the literal "12.6K" for every game. A
            cabin follow is currently a local favourite rather than a stored
            relationship, so there is no number to show yet. */}
        <header><span className="forum-game-logo"><img src={GAME_LOGOS[site.id]} alt="" /></span><span><strong>{name}</strong></span><button type="button" className={followed ? 'is-followed' : undefined} aria-pressed={followed} onClick={onToggleFollow}>{t(followed ? 'forum.users.following' : 'forum.users.follow')}</button></header>
        <div><span>MMORPG</span><span>{t('forum.redesign.openWorld')}</span><span>{t('forum.redesign.crossServer')}</span></div>
        <p>{t('forum.redesign.cabinDescription', { game: name })}</p>
      </section>

      {/* Two panels are gone from here. "Hot posts" listed two fixture titles
          with view counts of 9,824 and 7,641, identical in every cabin; the
          feed beside it is already the real thing. "Management" showed a fixed
          owner and administrator with pravatar portraits — and unlike the rest
          of this, that one asserted who holds authority over a game, which the
          role grants now actually record. It comes back reading
          /roles/games/{'{'}game{'}'} rather than inventing two names. */}
    </>
  )
}

function ForumComposerPage({
  focus,
  sites,
  initialGameId,
  avatarSrc,
  authorName,
  signedIn,
  onAuthRequired,
  onImageUnavailable,
  onDirtyChange,
  onCancel,
  onPublish,
}: {
  focus: ComposerFocus
  sites: readonly SiteCard[]
  initialGameId: string | null
  avatarSrc: string
  authorName: string
  signedIn: boolean
  onAuthRequired: () => void
  onImageUnavailable: () => void
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
  onPublish: (draft: ComposerDraft) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [gameIds, setGameIds] = useState<string[]>(() => initialGameId ? [initialGameId] : [])
  const [topics, setTopics] = useState<Array<(typeof COMPOSER_TOPICS)[number]>>(['discussion'])
  const [customTags, setCustomTags] = useState<string[]>([])
  const [gameQuery, setGameQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')
  const [gameInputActive, setGameInputActive] = useState(false)
  const [tagInputActive, setTagInputActive] = useState(false)
  const [gameActiveIndex, setGameActiveIndex] = useState(0)
  const [tagActiveIndex, setTagActiveIndex] = useState(0)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [videoInput, setVideoInput] = useState('')
  const [parsedVideoUrl, setParsedVideoUrl] = useState('')
  const [videoError, setVideoError] = useState('')
  const [error, setError] = useState('')
  /**
   * True while the post is in flight.
   *
   * Publishing used to be a synchronous localStorage write, so a second click
   * was harmless. Against a server it is a second post, so the submit handler
   * returns early and the button disables itself.
   */
  const [publishing, setPublishing] = useState(false)
  const imageUnavailableError = t('forum.composer.errors.imageUnavailable')
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const siteName = (site: SiteCard) => t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })
  const selectedSites = sites.filter((site) => gameIds.includes(site.id))
  const normalizedGameQuery = gameQuery.trim().toLocaleLowerCase()
  const gameSuggestions = normalizedGameQuery
    ? sites.filter((site) => !gameIds.includes(site.id)
      && `${siteName(site)} ${site.id}`.toLocaleLowerCase().includes(normalizedGameQuery))
    : []
  const normalizedTagQuery = tagQuery.trim().toLocaleLowerCase()
  const tagSuggestions = normalizedTagQuery
    ? COMPOSER_TOPICS.filter((topic) => !topics.includes(topic)
      && t(`forum.composer.topics.${topic}`).toLocaleLowerCase().includes(normalizedTagQuery))
    : []
  const selectedTagCount = topics.length + customTags.length
  const canCreateCustomTag = Boolean(tagQuery.trim())
    && selectedTagCount < FORUM_TAG_MAX_COUNT
    && !customTags.some((tag) => tag.toLocaleLowerCase() === normalizedTagQuery)
    && !COMPOSER_TOPICS.some((topic) => t(`forum.composer.topics.${topic}`).toLocaleLowerCase() === normalizedTagQuery)
  const gamePopupOpen = gameInputActive && Boolean(gameQuery.trim())
  const tagPopupOpen = tagInputActive && Boolean(tagQuery.trim())
  const tagOptionCount = tagSuggestions.length + Number(canCreateCustomTag)
  const gameActiveOptionId = gameSuggestions[gameActiveIndex]
    ? `forum-game-option-${gameActiveIndex}`
    : undefined
  const tagActiveOptionId = tagActiveIndex < tagOptionCount
    ? `forum-tag-option-${tagActiveIndex}`
    : undefined

  const dirty = isForumComposerDirty({
    title,
    content,
    gameIds,
    topics,
    customTags,
    gameQuery,
    tagQuery,
    videoUrl,
    videoInput,
  }, initialGameId)

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    setGameActiveIndex((current) => gameSuggestions.length > 0
      ? Math.min(current, gameSuggestions.length - 1)
      : 0)
  }, [gameSuggestions.length])

  useEffect(() => {
    setTagActiveIndex((current) => tagOptionCount > 0
      ? Math.min(current, tagOptionCount - 1)
      : 0)
  }, [tagOptionCount])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (focus === 'image') {
        setError(imageUnavailableError)
      } else if (focus === 'video') {
        setVideoDialogOpen(true)
      } else if (focus === 'topic') {
        tagInputRef.current?.focus()
      } else {
        titleRef.current?.focus()
      }
    })
    return () => window.clearTimeout(timeout)
  }, [focus, imageUnavailableError])

  const addGame = (gameId: string) => {
    if (gameIds.length >= FORUM_GAME_MAX_COUNT || gameIds.includes(gameId)) return
    setGameIds((current) => [...current, gameId])
    setGameQuery('')
    setGameActiveIndex(0)
    setError('')
  }

  const handleGameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && gameSuggestions.length > 0) {
      event.preventDefault()
      setGameInputActive(true)
      setGameActiveIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1
        return (current + offset + gameSuggestions.length) % gameSuggestions.length
      })
    } else if (event.key === 'Enter' && gamePopupOpen && gameSuggestions[gameActiveIndex]) {
      event.preventDefault()
      addGame(gameSuggestions[gameActiveIndex].id)
    } else if (event.key === 'Backspace' && !gameQuery && gameIds.length > 0) {
      setGameIds((current) => current.slice(0, -1))
    } else if (event.key === 'Escape') {
      setGameInputActive(false)
    }
  }

  const addTopic = (topic: (typeof COMPOSER_TOPICS)[number]) => {
    if (selectedTagCount >= FORUM_TAG_MAX_COUNT || topics.includes(topic)) return
    setTopics((current) => [...current, topic])
    setTagQuery('')
    setTagActiveIndex(0)
    setError('')
  }

  const addCustomTag = () => {
    const nextTag = tagQuery.trim()
    if (!canCreateCustomTag) return
    setCustomTags((current) => [...current, nextTag])
    setTagQuery('')
    setTagActiveIndex(0)
    setError('')
  }

  const handleTagKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && tagOptionCount > 0) {
      event.preventDefault()
      setTagInputActive(true)
      setTagActiveIndex((current) => {
        const offset = event.key === 'ArrowDown' ? 1 : -1
        return (current + offset + tagOptionCount) % tagOptionCount
      })
    } else if (event.key === 'Enter' && tagPopupOpen && tagOptionCount > 0) {
      event.preventDefault()
      if (tagSuggestions[tagActiveIndex]) addTopic(tagSuggestions[tagActiveIndex])
      else if (tagActiveIndex === tagSuggestions.length) addCustomTag()
    } else if (event.key === 'Backspace' && !tagQuery) {
      if (customTags.length > 0) setCustomTags((current) => current.slice(0, -1))
      else if (topics.length > 0) setTopics((current) => current.slice(0, -1))
    } else if (event.key === 'Escape') {
      setTagInputActive(false)
    }
  }

  const insertFormatting = (before: string, after: string, fallback: string) => {
    const textarea = contentRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = content.slice(start, end) || fallback
    const nextContent = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`
    if (nextContent.length > 5_000) return
    setContent(nextContent)
    setError('')
    window.setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const openImageDialog = () => {
    onImageUnavailable()
    setError(imageUnavailableError)
  }

  const openVideoDialog = () => {
    setVideoInput(videoUrl)
    setParsedVideoUrl(videoUrl)
    setVideoError('')
    setVideoDialogOpen(true)
  }

  const parseVideo = () => {
    const normalized = videoInput.trim()
    if (!forumVideoPlatform(normalized)) {
      setParsedVideoUrl('')
      setVideoError(t('forum.composer.errors.video'))
      return
    }
    setParsedVideoUrl(normalized)
    setVideoError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!signedIn) {
      onAuthRequired()
      return
    }
    if (publishing) return
    const normalizedTitle = title.trim()
    const normalizedContent = content.trim()
    if (normalizedTitle.length < 2) {
      setError(t('forum.composer.errors.title'))
      titleRef.current?.focus()
      return
    }
    if (normalizedContent.length < 10) {
      setError(t('forum.composer.errors.content'))
      contentRef.current?.focus()
      return
    }
    if (videoUrl && !forumVideoPlatform(videoUrl)) {
      setError(t('forum.composer.errors.video'))
      return
    }

    // The id and the timestamp are gone: both used to be invented here because
    // the client was writing the row itself. The server assigns them now, and a
    // post number the client guessed would be wrong the moment two people
    // published at once.
    setPublishing(true)
    const saved = await onPublish({
      title: normalizedTitle,
      body: normalizedContent,
      // Derived rather than chosen, as before: the composer offers no channel
      // picker, and `official` is administrators-only on the server.
      channel: gameIds.length > 0 ? 'games' : 'general',
      gameIds,
      // The API takes one topic; the composer collects a list of them. The rest
      // travel as ordinary tags rather than being dropped, which is what the tag
      // row displayed anyway.
      topic: topics[0] ?? 'discussion',
      tags: [...topics.slice(1), ...customTags],
      videoUrl: videoUrl || undefined,
    })
    setPublishing(false)
    if (!saved) {
      setError(t('forum.composer.errors.publish'))
      return
    }
  }

  const toolbarButtons = [
    { key: 'bold', icon: IconBold, before: '**', after: '**', fallbackKey: 'text' },
    { key: 'italic', icon: IconItalic, before: '*', after: '*', fallbackKey: 'text' },
    { key: 'underline', icon: IconUnderline, before: '<u>', after: '</u>', fallbackKey: 'text' },
    { key: 'heading', icon: IconH1, before: '## ', after: '', fallbackKey: 'headingText' },
    { key: 'list', icon: IconList, before: '- ', after: '', fallbackKey: 'listItem' },
    { key: 'orderedList', icon: IconListNumbers, before: '1. ', after: '', fallbackKey: 'listItem' },
    { key: 'quote', icon: IconQuote, before: '> ', after: '', fallbackKey: 'quoteText' },
    { key: 'link', icon: IconLink, before: '[', after: '](https://)', fallbackKey: 'linkText' },
  ]

  return (
    <section className="forum-publish-page" aria-labelledby="forum-publish-title">
      <button type="button" className="forum-publish-back" onClick={onCancel}>
        <IconArrowLeft className="size-4" stroke={1.8} aria-hidden="true" />
        {t('forum.composer.back')}
      </button>
      <header className="forum-publish-page-header">
        <h1 id="forum-publish-title">{t('forum.composer.dialogTitle')}</h1>
        <div className="forum-publish-author">
          <img src={avatarSrc} alt="" />
          <strong>{authorName}</strong>
        </div>
      </header>

      <form className="forum-publish-form" onSubmit={submit}>
        <div
          className="forum-token-field"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGameInputActive(false)
          }}
        >
          <label htmlFor="forum-game-query">{t('forum.composer.relatedGames')}</label>
          <div className="forum-token-input" data-active={gameInputActive || undefined}>
            {selectedSites.map((site) => (
              <span className="forum-token forum-game-token" key={site.id}>
                <img src={GAME_LOGOS[site.id]} alt="" />
                {siteName(site)}
                <button type="button" aria-label={t('forum.composer.removeGame', { game: siteName(site) })} onClick={() => setGameIds((current) => current.filter((id) => id !== site.id))}>
                  <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              id="forum-game-query"
              value={gameQuery}
              disabled={gameIds.length >= FORUM_GAME_MAX_COUNT}
              onFocus={() => {
                setGameInputActive(true)
                setGameActiveIndex(0)
              }}
              onClick={() => setGameInputActive(true)}
              onChange={(event) => {
                setGameInputActive(true)
                setGameQuery(event.target.value)
                setGameActiveIndex(0)
              }}
              onKeyDown={handleGameKeyDown}
              role="combobox"
              aria-expanded={gamePopupOpen}
              aria-controls="forum-game-suggestions"
              aria-activedescendant={gamePopupOpen ? gameActiveOptionId : undefined}
              aria-autocomplete="list"
              placeholder={t('forum.composer.gameInputPlaceholder')}
            />
            <small>{gameIds.length} / {FORUM_GAME_MAX_COUNT}</small>
          </div>
          {gamePopupOpen && (
            <div className="forum-autocomplete">
              <strong id="forum-game-suggestions-label">{t('forum.composer.matchingGames')}</strong>
              <div
                id="forum-game-suggestions"
                className="forum-autocomplete-options"
                role="listbox"
                aria-labelledby="forum-game-suggestions-label"
              >
                {gameSuggestions.map((site, index) => (
                  <button
                    id={`forum-game-option-${index}`}
                    key={site.id}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === gameActiveIndex}
                    onMouseEnter={() => setGameActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addGame(site.id)}
                  >
                    <img src={GAME_LOGOS[site.id]} alt="" />
                    <span><b>{siteName(site)}</b><small>{site.id.toLocaleUpperCase()}</small></span>
                    {index === gameActiveIndex && <kbd>{t('forum.composer.pressEnter')}</kbd>}
                  </button>
                ))}
              </div>
              {gameSuggestions.length === 0 && <p role="status">{t('forum.composer.noMatchingGames')}</p>}
            </div>
          )}
        </div>

        <div
          className="forum-token-field"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setTagInputActive(false)
          }}
        >
          <label htmlFor="forum-tag-query">{t('forum.composer.addTags')}</label>
          <div className="forum-token-input" data-active={tagInputActive || undefined}>
            {topics.map((topic) => (
              <span className="forum-token" key={topic}>
                {t(`forum.composer.topics.${topic}`)}
                <button type="button" aria-label={t('forum.composer.removeTag', { tag: t(`forum.composer.topics.${topic}`) })} onClick={() => setTopics((current) => current.filter((item) => item !== topic))}>
                  <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                </button>
              </span>
            ))}
            {customTags.map((tag) => (
              <span className="forum-token" key={tag}>
                {tag}
                <button type="button" aria-label={t('forum.composer.removeTag', { tag })} onClick={() => setCustomTags((current) => current.filter((item) => item !== tag))}>
                  <IconX className="size-3.5" stroke={2} aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              ref={tagInputRef}
              id="forum-tag-query"
              value={tagQuery}
              disabled={selectedTagCount >= FORUM_TAG_MAX_COUNT}
              onFocus={() => {
                setTagInputActive(true)
                setTagActiveIndex(0)
              }}
              onClick={() => setTagInputActive(true)}
              onChange={(event) => {
                setTagInputActive(true)
                setTagQuery(event.target.value.slice(0, 24))
                setTagActiveIndex(0)
              }}
              onKeyDown={handleTagKeyDown}
              role="combobox"
              aria-expanded={tagPopupOpen}
              aria-controls="forum-tag-suggestions"
              aria-activedescendant={tagPopupOpen ? tagActiveOptionId : undefined}
              aria-autocomplete="list"
              placeholder={t('forum.composer.tagInputPlaceholder')}
            />
            <small>{selectedTagCount} / {FORUM_TAG_MAX_COUNT}</small>
          </div>
          {tagPopupOpen && (
            <div className="forum-autocomplete">
              <strong id="forum-tag-suggestions-label">{t('forum.composer.matchingTags')}</strong>
              <div
                id="forum-tag-suggestions"
                className="forum-autocomplete-options"
                role="listbox"
                aria-labelledby="forum-tag-suggestions-label"
              >
                {tagSuggestions.map((topic, index) => (
                  <button
                    id={`forum-tag-option-${index}`}
                    key={topic}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === tagActiveIndex}
                    onMouseEnter={() => setTagActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => addTopic(topic)}
                  >
                    <IconHash className="size-4" stroke={1.8} aria-hidden="true" />
                    <span><b>{t(`forum.composer.topics.${topic}`)}</b></span>
                    {index === tagActiveIndex && <kbd>{t('forum.composer.pressEnter')}</kbd>}
                  </button>
                ))}
                {canCreateCustomTag && (
                  <button
                    id={`forum-tag-option-${tagSuggestions.length}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={tagActiveIndex === tagSuggestions.length}
                    onMouseEnter={() => setTagActiveIndex(tagSuggestions.length)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={addCustomTag}
                  >
                    <IconHash className="size-4" stroke={1.8} aria-hidden="true" />
                    <span><b>{t('forum.composer.createTag', { tag: tagQuery.trim() })}</b></span>
                    {tagActiveIndex === tagSuggestions.length && <kbd>{t('forum.composer.pressEnter')}</kbd>}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="forum-publish-editor-field">
          <label htmlFor="forum-post-title">{t('forum.composer.postTitle')}</label>
          <input
            ref={titleRef}
            id="forum-post-title"
            value={title}
            maxLength={80}
            onChange={(event) => { setTitle(event.target.value); setError('') }}
            placeholder={t('forum.composer.postTitlePlaceholder')}
          />
        </div>

        <div className="forum-publish-editor-field">
          <label htmlFor="forum-post-content">{t('forum.composer.content')}</label>
          <div className="forum-rich-editor">
            <div className="forum-rich-toolbar" role="toolbar" aria-label={t('forum.composer.toolbar.label')}>
              {toolbarButtons.map(({ key, icon: Icon, before, after, fallbackKey }) => {
                const label = t(`forum.composer.toolbar.${key}`)
                return (
                  <button key={key} type="button" aria-label={label} title={label} onClick={() => insertFormatting(before, after, t(`forum.composer.toolbar.${fallbackKey}`))}>
                    <Icon className="size-4" stroke={1.8} aria-hidden="true" />
                  </button>
                )
              })}
              <span aria-hidden="true" />
              <button type="button" aria-label={t('forum.composer.image')} title={t('forum.composer.image')} onClick={openImageDialog}>
                <IconPhoto className="size-4" stroke={1.8} aria-hidden="true" />
              </button>
              <button type="button" aria-label={t('forum.composer.video')} title={t('forum.composer.video')} onClick={openVideoDialog}>
                <IconVideo className="size-4" stroke={1.8} aria-hidden="true" />
              </button>
            </div>
            {error === imageUnavailableError && (
              <p className="forum-editor-media-error" role="alert">{error}</p>
            )}
            <textarea
              ref={contentRef}
              id="forum-post-content"
              value={content}
              maxLength={5_000}
              onChange={(event) => { setContent(event.target.value); setError('') }}
              placeholder={t('forum.composer.contentPlaceholder')}
            />
            {videoUrl && (
              <div className="forum-editor-video">
                <IconVideo className="size-5" stroke={1.8} aria-hidden="true" />
                <span><strong>{t(`forum.composer.videoPlatforms.${forumVideoPlatform(videoUrl)}`)}</strong><small>{videoUrl}</small></span>
                <button type="button" aria-label={t('forum.composer.removeVideo')} onClick={() => setVideoUrl('')}>
                  <IconX className="size-4" stroke={2} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>

        <footer className="forum-publish-footer">
          <div>
            <span>{content.length} / 5000</span>
            <strong role="alert">{error === imageUnavailableError ? null : error}</strong>
          </div>
          <button type="button" className="forum-publish-cancel" onClick={onCancel}>{t('forum.composer.cancel')}</button>
          <button type="submit" className="forum-publish-submit" disabled={publishing}>
            <IconPencil className="size-4" stroke={1.8} aria-hidden="true" />
            {t(publishing ? 'forum.detailExtra.sending' : 'forum.composer.publish')}
          </button>
        </footer>
      </form>

      <Dialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen}>
        <DialogContent className="forum-media-dialog forum-video-dialog z-[var(--arkive-layer-sheet)]" overlayClassName="z-[var(--arkive-layer-sheet-backdrop)]" showCloseButton={false}>
          <DialogHeader className="forum-media-dialog-header">
            <DialogTitle>{t('forum.composer.videoDialogTitle')}</DialogTitle>
            <DialogDescription>{t('forum.composer.videoDialogDescription')}</DialogDescription>
            <DialogClose asChild><button type="button" className={POPUP_CLOSE_CONTROL_CLASS} aria-label={t('forum.composer.closeMediaDialog')}><IconX className="size-5" stroke={1.8} /></button></DialogClose>
          </DialogHeader>
          <div className="forum-video-platforms" aria-label={t('forum.composer.supportedVideoPlatforms')}>
            <span>{t('forum.composer.videoPlatforms.bilibili')}</span>
            <span>{t('forum.composer.videoPlatforms.douyin')}</span>
          </div>
          <label className="forum-video-link-field" htmlFor="forum-video-link">
            <span>{t('forum.composer.videoLink')}</span>
            <div>
              {/* Bounded: a valid bilibili host with a few hundred KB of query
                  string is still a valid URL, and it is persisted with the post.
                  Without a cap the write is refused and the composer can only
                  offer the generic "try again". 300 clears every real share
                  link with room to spare. */}
              <input id="forum-video-link" type="url" maxLength={300} value={videoInput} onChange={(event) => { setVideoInput(event.target.value); setParsedVideoUrl(''); setVideoError('') }} placeholder={t('forum.composer.videoPlaceholder')} />
              <button type="button" onClick={parseVideo}>{t('forum.composer.parseVideo')}</button>
            </div>
          </label>
          {videoError && <p className="forum-video-error" role="alert">{videoError}</p>}
          {parsedVideoUrl && forumVideoPlatform(parsedVideoUrl) && (
            <div className="forum-video-preview">
              <span className="forum-video-preview-art"><IconVideo className="size-8" stroke={1.5} aria-hidden="true" /></span>
              <div>
                <small>{t(`forum.composer.videoPlatforms.${forumVideoPlatform(parsedVideoUrl)}`)}</small>
                <strong>{t('forum.composer.videoPreviewTitle')}</strong>
                <span><IconCheck className="size-4" stroke={2} aria-hidden="true" />{t('forum.composer.validVideoLink')}</span>
              </div>
              <button type="button" aria-label={t('forum.composer.removeVideo')} onClick={() => { setParsedVideoUrl(''); setVideoInput('') }}><IconX className="size-4" stroke={2} /></button>
            </div>
          )}
          <DialogFooter className="forum-media-dialog-footer">
            <DialogClose asChild><button type="button" className="forum-publish-cancel">{t('forum.composer.cancel')}</button></DialogClose>
            <button type="button" className="forum-publish-submit" disabled={!parsedVideoUrl} onClick={() => { setVideoUrl(parsedVideoUrl); setVideoDialogOpen(false); setError('') }}>
              {t('forum.composer.insertVideo')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ForumPostCard({
  post,
  image,
  followed,
  bookmarked,
  liked,
  onToggleFollow,
  onToggleBookmark,
  onToggleLike,
  onOpen,
  onShare,
}: {
  post: ForumPost
  image?: string
  followed: boolean
  bookmarked: boolean
  liked: boolean
  onToggleFollow: () => void
  onToggleBookmark: () => void
  onToggleLike: () => void
  onOpen: () => void
  onShare: () => void
}) {
  const { t } = useTranslation()

  return (
    <article className="forum-post">
      <img className="forum-post-avatar" src={post.avatarSrc} alt="" loading="lazy" />
      <div className="forum-post-content">
        <div className="forum-post-author">
          <strong><a href={post.own ? '#account/posts' : publicProfileHref(post.authorUid)}>{postAuthor(post)}</a></strong>
          {post.featured && <span>{t('forum.feed.qualityAuthor')}</span>}
          <small>{postTime(post)}</small>
          {!post.own && (
            <button
              type="button"
              className="forum-post-follow"
              aria-pressed={followed}
              onClick={onToggleFollow}
            >
              {t(followed ? 'forum.users.following' : 'forum.users.follow')}
            </button>
          )}
          {post.own && <button type="button" className="forum-post-more" aria-label={t('forum.redesign.more')}><IconDots className="size-5" stroke={1.8} /></button>}
        </div>
        <div
          className="forum-post-open-area"
          role="link"
          tabIndex={0}
          aria-label={t('forum.detail.openPost', { title: postTitle(post) })}
          onClick={onOpen}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onOpen()
          }}
        >
          <h3>{postTitle(post)}</h3>
          <p>{postCopy(post)}</p>
          <div className="forum-post-tags">
            {postTags(post).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          {image && <img className="forum-post-media" src={image} alt={postTitle(post)} loading="lazy" />}
        </div>
        {post.videoUrl && (
          <a className="forum-post-video" href={post.videoUrl} target="_blank" rel="noreferrer">
            <IconVideo className="size-4" stroke={1.8} aria-hidden="true" />
            {t('forum.composer.openVideo')}
          </a>
        )}
      </div>
      <div className="forum-post-actions">
        <button type="button" aria-label={t('forum.actions.like')} aria-pressed={liked} onClick={onToggleLike}>
          <IconHeart className="size-4" stroke={1.8} aria-hidden="true" />
          <span>{t('forum.detail.like')}</span><strong>{post.likeCount}</strong>
        </button>
        <button type="button" onClick={onOpen}>
          <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
          <span>{t('forum.redesign.reply')}</span><strong>{post.commentCount}</strong>
        </button>
        <button type="button" aria-label={t('forum.actions.bookmark')} aria-pressed={bookmarked} onClick={onToggleBookmark}>
          <IconBookmark className="size-4" stroke={1.8} aria-hidden="true" />
          <span>{t('forum.detail.bookmark')}</span><strong>{post.bookmarkCount}</strong>
        </button>
        <button type="button" onClick={onShare}>
          <IconShare3 className="size-4" stroke={1.8} aria-hidden="true" />
          <span>{t('forum.redesign.share')}</span><strong>0</strong>
        </button>
      </div>
    </article>
  )
}

function ForumPostDetail({
  post,
  comments,
  commentTotal,
  commentsLoaded,
  loading,
  error,
  followed,
  images,
  onBack,
  onComingSoon,
  onAuthRequired,
  currentAvatar,
  onToggleLike,
  onToggleBookmark,
  onToggleFollow,
  onToggleCommentLike,
  onSubmitComment,
  onDeletePost,
  onSavePost,
  signedIn,
}: {
  post: ForumPost
  comments: ForumComment[]
  commentTotal: number
  /** Rows this page returned, replies included — the figure total compares to. */
  commentsLoaded: number
  loading: boolean
  error: string | null
  followed: boolean
  images: string[]
  onBack: () => void
  onComingSoon: () => void
  onAuthRequired: () => void
  currentAvatar: string
  onToggleLike: () => void
  onToggleBookmark: () => void
  onToggleFollow: () => void
  onToggleCommentLike: (comment: ForumComment) => void
  onSubmitComment: (body: string, parentId?: string) => Promise<boolean>
  onDeletePost: () => void
  onSavePost: (title: string, body: string) => Promise<boolean>
  signedIn: boolean
}) {
  const { t, i18n } = useTranslation()
  const liked = post.liked
  const bookmarked = post.bookmarked
  /**
   * The comment composer.
   *
   * `replyingTo` is null for a new top-level comment and otherwise the comment
   * being answered. One piece of state rather than a composer per row: only one
   * can be open at a time, and rendering an input beside every comment was how
   * the draft in one of them got lost when another opened.
   */
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<ForumComment | null>(null)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState(post.title)
  const [editBody, setEditBody] = useState(post.body)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const numberFormatter = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language)
  const formatCount = (count: number) => numberFormatter.format(count)
  const discussionId = `forum-discussion-${post.postNo}`
  const runAuthenticated = (action: () => void) => {
    if (!signedIn) {
      onAuthRequired()
      return
    }
    action()
  }

  const sendComment = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const ok = await onSubmitComment(body, replyingTo?.id)
    setSending(false)
    if (!ok) return
    // Cleared only on success, so a failed send leaves the writing in the box
    // rather than discarding it with an apology.
    setDraft('')
    setReplyingTo(null)
  }

  const saveEdit = async () => {
    const title = editTitle.trim()
    const body = editBody.trim()
    if (!title || !body) return
    if (await onSavePost(title, body)) setEditing(false)
  }

  return (
    <div className="forum-detail-stack">
      <header className="forum-detail-heading">
        <button
          type="button"
          className="forum-detail-back"
          aria-label={t('forum.detail.back')}
          title={t('forum.detail.back')}
          onClick={onBack}
        >
          <IconArrowLeft className="size-4" stroke={1.8} aria-hidden="true" />
        </button>
        <div>
          {editing ? (
            <input
              className="forum-detail-edit-title"
              value={editTitle}
              maxLength={200}
              aria-label={t('forum.composer.titleLabel')}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          ) : (
            <h1>{postTitle(post)}</h1>
          )}
          <div className="forum-detail-tags">
            {postTags(post).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </div>
      </header>

      <article className="forum-panel forum-detail-article">
        <header className="forum-detail-byline">
          <img src={post.avatarSrc} alt="" />
          <div>
            <strong><a href={post.own ? '#account/posts' : publicProfileHref(post.authorUid)}>{postAuthor(post)}</a></strong>
            <span>
              {t('forum.detail.byline', { time: postTime(post) })}
              {post.editedAt && ` · ${t('forum.detailExtra.edited')}`}
            </span>
          </div>
          {post.own ? (
            // The overflow button was a dead affordance: rendered, styled, and
            // wired to nothing. These are the two things it was standing in for.
            <div className="forum-detail-owner-actions">
              <button type="button" onClick={() => { setEditTitle(post.title); setEditBody(post.body); setEditing(!editing) }}>
                <IconPencil className="size-4" stroke={1.8} aria-hidden="true" />
                {t(editing ? 'forum.detailExtra.cancelEdit' : 'forum.detailExtra.edit')}
              </button>
              <button type="button" onClick={() => setConfirmDelete(true)}>
                <IconX className="size-4" stroke={1.8} aria-hidden="true" />
                {t('forum.detailExtra.delete')}
              </button>
            </div>
          ) : (
            <button type="button" aria-pressed={followed} onClick={() => runAuthenticated(onToggleFollow)}>
              {t(followed ? 'forum.users.following' : 'forum.users.follow')}
            </button>
          )}
        </header>

        <div className="forum-detail-body">
          {editing ? (
            <>
              <textarea
                className="forum-detail-edit-body"
                value={editBody}
                maxLength={20000}
                rows={12}
                aria-label={t('forum.composer.bodyLabel')}
                onChange={(event) => setEditBody(event.target.value)}
              />
              <div className="forum-detail-edit-actions">
                <button type="button" onClick={() => void saveEdit()} disabled={!editTitle.trim() || !editBody.trim()}>
                  <IconCheck className="size-4" stroke={1.8} aria-hidden="true" />
                  {t('forum.detailExtra.saveEdit')}
                </button>
              </div>
            </>
          ) : (
            <p className="forum-detail-lead">{postCopy(post)}</p>
          )}
          {images.length > 0 && (
            <div className="forum-detail-media-grid">
              {images.map((image, index) => (
                <img key={`${image.slice(0, 48)}-${index}`} src={image} alt={postTitle(post)} loading={index === 0 ? 'eager' : 'lazy'} />
              ))}
            </div>
          )}
          {post.videoUrl && (
            <a className="forum-detail-video" href={post.videoUrl} target="_blank" rel="noreferrer">
              <IconVideo className="size-5" stroke={1.8} aria-hidden="true" />
              {t('forum.composer.openVideo')}
            </a>
          )}
          {/* `forum.detail.continuation` used to print here — filler prose that
              read as part of whatever post you were looking at. With real bodies
              there is nothing to pad. */}
        </div>

        <footer className="forum-detail-actions">
          <button type="button" aria-pressed={liked} onClick={onToggleLike}>
            <IconHeart className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.detail.like')}</span>
            {/* The count is the server's now, so the reader's own like is already
                in it. Adding `+ (liked ? 1 : 0)` on top would double-count it. */}
            <strong>{formatCount(post.likeCount)}</strong>
          </button>
          <button
            type="button"
            onClick={() => document.getElementById(discussionId)?.scrollIntoView({ behavior: 'auto', block: 'start' })}
          >
            <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.redesign.reply')}</span>
            <strong>{formatCount(post.commentCount)}</strong>
          </button>
          <button type="button" aria-pressed={bookmarked} onClick={onToggleBookmark}>
            <IconBookmark className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.detail.bookmark')}</span>
            <strong>{formatCount(post.bookmarkCount)}</strong>
          </button>
          <button type="button" onClick={onComingSoon}>
            <IconShare3 className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.redesign.share')}</span>
          </button>
        </footer>
      </article>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="forum-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{t('forum.detailExtra.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('forum.detailExtra.deleteDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose className={POPUP_CLOSE_CONTROL_CLASS}>{t('forum.detailExtra.deleteCancel')}</DialogClose>
            <button type="button" onClick={() => { setConfirmDelete(false); onDeletePost() }}>
              {t('forum.detailExtra.delete')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section id={discussionId} className="forum-panel forum-detail-discussion">
        <header className="forum-reply-toolbar">
          <div className="forum-comment-heading">
            <h2>{t('forum.detail.discussion')}</h2>
            <span>{formatCount(commentTotal)}</span>
          </div>
          {/* The sort and author-only controls were `useState` with no reader —
              they changed a variable and nothing else. Listing a thread by
              popularity or by author is a server capability that does not exist
              yet, so rather than keep three buttons that do nothing, they are
              gone until it does. */}
        </header>

        <div className="forum-detail-composer">
          <img src={currentAvatar} alt="" />
          {signedIn ? (
            <div className="forum-detail-composer-input">
              {replyingTo && (
                <div className="forum-detail-replying">
                  <span>{t('forum.detail.replyingTo', { name: replyingTo.author })}</span>
                  <button type="button" aria-label={t('forum.detailExtra.cancelReply')} onClick={() => setReplyingTo(null)}>
                    <IconX className="size-4" stroke={1.8} aria-hidden="true" />
                  </button>
                </div>
              )}
              <textarea
                value={draft}
                rows={replyingTo ? 3 : 2}
                maxLength={20000}
                placeholder={t('forum.detail.replyPlaceholder')}
                aria-label={t('forum.detail.replyPlaceholder')}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="button"
                className="forum-detail-send"
                disabled={!draft.trim() || sending}
                onClick={() => void sendComment()}
              >
                {t(sending ? 'forum.detailExtra.sending' : 'forum.detailExtra.send')}
              </button>
            </div>
          ) : (
            <button type="button" onClick={onAuthRequired}>{t('forum.detail.replyPlaceholder')}</button>
          )}
        </div>

        {loading ? (
          <p className="forum-feed-status" role="status">{t('forum.loading')}</p>
        ) : error ? (
          <p className="forum-feed-status is-error" role="alert">{error}</p>
        ) : comments.length > 0 ? (
          <div className="forum-comment-list">
            {comments.map((comment) => (
              <article key={comment.id} className="forum-comment-thread">
                <div className="forum-comment-main">
                  <img src={comment.avatarSrc} alt="" />
                  <div>
                    <header>
                      <strong>
                        <a href={publicProfileHref(comment.authorUid)}>{comment.author}</a>
                      </strong>
                      {comment.authorUid === post.authorUid && (
                        <span className="forum-comment-author-badge">{t('forum.detail.authorBadge')}</span>
                      )}
                      {comment.commentNo !== null && (
                        <span className="forum-comment-floor">{t('forum.detailExtra.floor', { no: comment.commentNo })}</span>
                      )}
                      <time dateTime={comment.createdAt}>{comment.time}</time>
                    </header>
                    <p>{comment.body}</p>
                    <footer>
                      <button
                        type="button"
                        aria-label={t('forum.detail.commentLikeLabel')}
                        aria-pressed={comment.liked}
                        onClick={() => onToggleCommentLike(comment)}
                      >
                        <IconThumbUp className="size-4" stroke={1.8} aria-hidden="true" />
                        <span>{formatCount(comment.likeCount)}</span>
                      </button>
                      <button type="button" onClick={() => runAuthenticated(() => setReplyingTo(comment))}>
                        <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
                        {t('forum.detail.reply')}
                      </button>
                    </footer>

                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="forum-comment-reply">
                        <img src={reply.avatarSrc} alt="" />
                        <div>
                          <header>
                            <strong>
                              <a href={publicProfileHref(reply.authorUid)}>{reply.author}</a>
                            </strong>
                            {reply.authorUid === post.authorUid && (
                              <span className="forum-comment-author-badge">{t('forum.detail.authorBadge')}</span>
                            )}
                            <span>{t('forum.detail.replyingTo', { name: comment.author })}</span>
                            <time dateTime={reply.createdAt}>{reply.time}</time>
                          </header>
                          <p>{reply.body}</p>
                          <footer>
                            <button
                              type="button"
                              aria-label={t('forum.detail.commentLikeLabel')}
                              aria-pressed={reply.liked}
                              onClick={() => onToggleCommentLike(reply)}
                            >
                              <IconThumbUp className="size-4" stroke={1.8} aria-hidden="true" />
                              <span>{formatCount(reply.likeCount)}</span>
                            </button>
                            {/* Replying to a reply lands on the same top-level
                                comment, matching how the server refuses a third
                                level and how nestComments folds one back. */}
                            <button type="button" onClick={() => runAuthenticated(() => setReplyingTo(comment))}>
                              <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
                              {t('forum.detail.reply')}
                            </button>
                          </footer>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ))}
            {commentTotal > commentsLoaded && (
              // One request fetches the server's ceiling of 200. Saying so beats
              // showing 200 of 400 as though it were the whole thread.
              <p className="forum-comment-truncated" role="status">
                {t('forum.detailExtra.moreComments', { count: commentTotal - commentsLoaded })}
              </p>
            )}
          </div>
        ) : (
          <p className="forum-comment-empty">{t('forum.detail.noComments')}</p>
        )}
      </section>
    </div>
  )
}
