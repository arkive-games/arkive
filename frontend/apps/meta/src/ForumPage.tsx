import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { scrollToResults } from './scrollToResults'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@gamemap/auth'
import { defineMemoryRecord, memoryPolicy, useMemoryState } from '@gamemap/state-memory'
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
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconBookmark,
  IconBold,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconDeviceGamepad2,
  IconFlame,
  IconH1,
  IconHash,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconMessageCircle,
  IconMessages,
  IconPhoto,
  IconPinFilled,
  IconPencil,
  IconQuote,
  IconRefresh,
  IconSearch,
  IconSpeakerphone,
  IconThumbUp,
  IconTrash,
  IconUnderline,
  IconUpload,
  IconVideo,
  IconX,
} from '@tabler/icons-react'
import type { SiteCard } from './sites'
import aion2Logo from './assets/aion2-logo.webp'
import palworldLogo from './assets/palworld-logo.png'
import sts2Logo from './assets/sts2-logo.png'
import vrisingLogo from './assets/vrising-logo.png'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'
import { avatarUrl, findPublicProfile, publicProfileHref, RECOMMENDED_USERS } from './userSystemData'
import { useUserSystem, type LocalForumPost } from './UserSystemState'
import './forum.css'

type ForumChannel = 'hot' | 'general' | 'official' | 'games'
type FeedTab = 'recommended' | 'latest' | 'featured'

const POSTS_PER_PAGE = 5
const MAX_VISIBLE_PAGES = 5

interface ForumPageProps {
  sites: readonly SiteCard[]
  onComingSoon: () => void
  onAuthRequired: () => void
}

interface ForumPost {
  id: string
  channel: Exclude<ForumChannel, 'hot'>
  gameId?: string
  gameIds?: string[]
  authorKey?: string
  author?: string
  timeKey?: string
  time?: string
  titleKey?: string
  title?: string
  copyKey?: string
  copy?: string
  tagKeys?: string[]
  tags?: string[]
  avatarSeed: string
  avatarSrc?: string
  authorNumber: string
  followerCount: number
  commentCount: number
  likeCount: number
  bookmarkCount: number
  imageSrc?: string
  imageSrcs?: string[]
  videoUrl?: string
  own?: boolean
  featured?: boolean
}

type ComposerFocus = 'body' | 'image' | 'video' | 'topic'

function postAuthor(post: ForumPost, t: TFunction) {
  return post.author ?? (post.authorKey ? t(post.authorKey) : '')
}

function postTime(post: ForumPost, t: TFunction) {
  return post.time ?? (post.timeKey ? t(post.timeKey) : '')
}

function postTitle(post: ForumPost, t: TFunction) {
  return post.title ?? (post.titleKey ? t(post.titleKey) : '')
}

function postCopy(post: ForumPost, t: TFunction) {
  return post.copy ?? (post.copyKey ? t(post.copyKey) : '')
}

function postTags(post: ForumPost, t: TFunction) {
  return post.tags ?? (post.tagKeys ?? []).map((key) => t(key))
}

const COMPOSER_TOPICS = ['guide', 'question', 'testing', 'discussion'] as const
const FORUM_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const FORUM_IMAGE_MAX_BYTES = 2 * 1024 * 1024
const FORUM_IMAGE_TOTAL_MAX_BYTES = 4 * 1024 * 1024
const FORUM_IMAGE_MAX_COUNT = 9
const FORUM_GAME_MAX_COUNT = 5
const FORUM_TAG_MAX_COUNT = 10

interface ComposerImage {
  id: string
  src: string
  name: string
  size: number
}

function readForumImage(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

/**
 * `crypto.randomUUID` is `[SecureContext]`-only, so it is undefined over plain
 * http -- which is exactly how the LAN/phone QA origin is served. Calling it
 * there threw mid-publish and the dialog just sat there with nothing saved and
 * no error shown. The `Date.now()` prefix already carries the uniqueness this
 * needs; the suffix only has to break ties within the same millisecond.
 */
function localPostSuffix() {
  // `typeof`, not a truthiness check: the DOM lib types randomUUID as always
  // present, so TS narrows a plain `if` away (TS2774) even though the runtime
  // value really is undefined outside a secure context.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return Math.trunc(Math.random() * 1e9).toString(36)
}

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

const CHANNELS: Array<{
  key: ForumChannel
  icon: typeof IconFlame
}> = [
  { key: 'hot', icon: IconFlame },
  { key: 'general', icon: IconMessages },
  { key: 'official', icon: IconSpeakerphone },
  { key: 'games', icon: IconDeviceGamepad2 },
]

const POSTS: ForumPost[] = [
  {
    id: 'vrising-routes',
    channel: 'games',
    gameId: 'vrising',
    authorKey: 'forum.posts.vrising.author',
    timeKey: 'forum.time.today',
    titleKey: 'forum.posts.vrising.title',
    copyKey: 'forum.posts.vrising.copy',
    tagKeys: ['forum.tags.vrising', 'forum.tags.guide'],
    avatarSeed: 'arkive-dusk-raven',
    authorNumber: '10274831',
    followerCount: 1284,
    commentCount: 1,
    likeCount: 86,
    bookmarkCount: 31,
    featured: true,
  },
  {
    id: 'aion2-build',
    channel: 'games',
    gameId: 'aion2',
    authorKey: 'forum.posts.aion2.author',
    timeKey: 'forum.time.today',
    titleKey: 'forum.posts.aion2.title',
    copyKey: 'forum.posts.aion2.copy',
    tagKeys: ['forum.tags.aion2', 'forum.tags.build'],
    avatarSeed: 'arkive-wind-string',
    authorNumber: '10039267',
    followerCount: 946,
    commentCount: 1,
    likeCount: 64,
    bookmarkCount: 22,
    featured: true,
  },
  {
    id: 'palworld-work',
    channel: 'games',
    gameId: 'palworld',
    authorKey: 'forum.posts.palworld.author',
    timeKey: 'forum.time.yesterday',
    titleKey: 'forum.posts.palworld.title',
    copyKey: 'forum.posts.palworld.copy',
    tagKeys: ['forum.tags.palworld', 'forum.tags.testing'],
    avatarSeed: 'arkive-island-builder',
    authorNumber: '10357142',
    followerCount: 731,
    commentCount: 1,
    likeCount: 47,
    bookmarkCount: 18,
  },
  {
    id: 'collection-progress',
    channel: 'general',
    authorKey: 'forum.posts.general.author',
    timeKey: 'forum.time.yesterday',
    titleKey: 'forum.posts.general.title',
    copyKey: 'forum.posts.general.copy',
    tagKeys: ['forum.tags.general'],
    avatarSeed: 'arkive-paper-route',
    authorNumber: '10824695',
    followerCount: 418,
    commentCount: 1,
    likeCount: 23,
    bookmarkCount: 9,
  },
  {
    id: 'community-guide',
    channel: 'official',
    authorKey: 'forum.posts.official.author',
    timeKey: 'forum.time.thisWeek',
    titleKey: 'forum.posts.official.title',
    copyKey: 'forum.posts.official.copy',
    tagKeys: ['forum.tags.official'],
    avatarSeed: 'arkive-community-team',
    authorNumber: '10000012',
    followerCount: 3276,
    commentCount: 1,
    likeCount: 112,
    bookmarkCount: 40,
    featured: true,
  },
]


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

export function ForumPage({ sites, onComingSoon, onAuthRequired }: ForumPageProps) {
  const { t } = useTranslation()
  const { status, user } = useAuth()
  const {
    state: userSystemState,
    toggleBookmarkedPost,
    toggleFollowedUser,
    toggleLikedPost,
    publishForumPost,
  } = useUserSystem()
  const [channel, setChannel] = useState<ForumChannel>('hot')
  const [feedTab, setFeedTab] = useState<FeedTab>('recommended')
  const [gameFilter, setGameFilter] = useState<string | null>(null)
  const [gamesExpanded, setGamesExpanded] = useState(true)
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [followingOnly, setFollowingOnly] = useState(false)
  const [composerOpen, setComposerOpen] = useState(
    () => window.location.hash.replace(/^#/, '') === 'forum/new',
  )
  const [composerFocus, setComposerFocus] = useState<ComposerFocus>('body')
  const [publishNotice, setPublishNotice] = useState(false)
  const signedIn = status === 'authenticated'
  const currentAvatar = userSystemState.profile.avatarSrc ?? DEFAULT_AVATAR_SRC

  const siteById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites],
  )

  const localPosts = useMemo<ForumPost[]>(() => userSystemState.publishedPosts.map((post) => ({
    id: post.id,
    channel: post.channel,
    gameId: post.gameId ?? undefined,
    gameIds: post.gameIds,
    author: user?.name ?? '',
    timeKey: 'forum.time.today',
    title: post.title,
    copy: post.content,
    tags: [
      ...post.gameIds.map((gameId) => t(`forum.games.${gameId}`)),
      ...post.topics.map((topic) => t(`forum.composer.topics.${topic}`, { defaultValue: topic })),
      ...post.tags,
    ],
    avatarSeed: user?.id ?? 'arkive-anonymous',
    avatarSrc: currentAvatar,
    authorNumber: user?.id ?? '',
    followerCount: 0,
    commentCount: 0,
    likeCount: 0,
    bookmarkCount: 0,
    imageSrc: post.imageSrc ?? undefined,
    imageSrcs: post.imageSrcs,
    videoUrl: post.videoUrl ?? undefined,
    own: true,
  })), [currentAvatar, t, user?.id, user?.name, userSystemState.publishedPosts])

  // `localPosts` is already newest-first (publishForumPost prepends), while the
  // static POSTS fixtures are authored oldest-first. "Latest" therefore flips
  // only the fixtures: reversing the combined list instead would sink the post
  // the user just published to the very bottom of the feed.
  const allPosts = useMemo(
    () => (feedTab === 'latest'
      ? [...localPosts, ...[...POSTS].reverse()]
      : [...localPosts, ...POSTS]),
    [feedTab, localPosts],
  )

  const visiblePosts = useMemo(() => {
    const normalizedQuery = submittedQuery.trim().toLocaleLowerCase()
    const filtered = allPosts.filter((post) => {
      if (channel !== 'hot' && post.channel !== channel) return false
      if (gameFilter && !(post.gameIds ?? (post.gameId ? [post.gameId] : [])).includes(gameFilter)) return false
      if (feedTab === 'featured' && !post.featured) return false
      if (followingOnly && !userSystemState.followedUserIds.includes(post.authorNumber)) return false
      if (!normalizedQuery) return true

      const searchable = [
        postAuthor(post, t),
        postTitle(post, t),
        postCopy(post, t),
        ...postTags(post, t),
      ].join(' ').toLocaleLowerCase()
      return searchable.includes(normalizedQuery)
    })

    return filtered
  }, [allPosts, channel, feedTab, followingOnly, gameFilter, submittedQuery, t, userSystemState.followedUserIds])

  const totalPages = Math.max(1, Math.ceil(visiblePosts.length / POSTS_PER_PAGE))
  const feedSectionRef = useRef<HTMLElement>(null)
  // Page changes land on the feed section rather than leaving the reader wherever the
  // pager happened to be, which on a long page is below the first rows of the new page.
  const goToPage = (next: number) => {
    setCurrentPage(next)
    scrollToResults(feedSectionRef.current)
  }
  const activePage = Math.min(currentPage, totalPages)
  const visiblePageNumbers = getVisiblePageNumbers(activePage, totalPages)
  const paginatedPosts = visiblePosts.slice(
    (activePage - 1) * POSTS_PER_PAGE,
    activePage * POSTS_PER_PAGE,
  )
  const selectedPost = selectedPostId
    ? allPosts.find((post) => post.id === selectedPostId) ?? null
    : null

  useEffect(() => {
    if (!publishNotice) return
    const timeout = window.setTimeout(() => setPublishNotice(false), 2600)
    return () => window.clearTimeout(timeout)
  }, [publishNotice])

  useEffect(() => {
    const syncComposerRoute = () => {
      setComposerOpen(window.location.hash.replace(/^#/, '') === 'forum/new')
    }
    window.addEventListener('hashchange', syncComposerRoute)
    return () => window.removeEventListener('hashchange', syncComposerRoute)
  }, [])

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmittedQuery(query)
    setCurrentPage(1)
  }

  const selectChannel = (nextChannel: ForumChannel) => {
    setChannel(nextChannel)
    if (nextChannel !== 'games') setGameFilter(null)
    setCurrentPage(1)
    setSelectedPostId(null)
  }

  const openPost = (postId: string) => {
    setSelectedPostId(postId)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const closePost = () => {
    setSelectedPostId(null)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const toggleFollow = (id: string) => {
    if (!signedIn) {
      onAuthRequired()
      return
    }
    toggleFollowedUser(id)
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
    setComposerOpen(true)
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
    setComposerOpen(false)
    returnToForum()
  }

  const publish = (post: LocalForumPost) => {
    publishForumPost(post)
    setComposerOpen(false)
    setPublishNotice(true)
    setChannel(post.channel)
    setGameFilter(post.gameIds[0] ?? post.gameId)
    setFeedTab('recommended')
    setCurrentPage(1)
    setSelectedPostId(post.id)
    returnToForum()
    window.scrollTo({ top: 0, behavior: 'auto' })
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
      <button type="submit">{t('forum.search.action')}</button>
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
            onCancel={closeComposer}
            onPublish={publish}
          />
        </main>
        {publishNotice && (
          <div className="forum-publish-toast" role="status">
            <IconCheck className="size-5" stroke={2} aria-hidden="true" />
            {t('forum.composer.published')}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <main className="forum-main">
      <div className="forum-shell">
        <aside className="forum-left-rail" aria-label={t('forum.channels.label')}>
          <nav className="forum-panel forum-channel-panel">
            <h2>{t('forum.channels.label')}</h2>
            {CHANNELS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={channel === key && !gameFilter ? 'is-active' : undefined}
                aria-pressed={channel === key && !gameFilter}
                aria-expanded={key === 'games' ? gamesExpanded : undefined}
                onClick={() => {
                  selectChannel(key)
                  if (key === 'games') setGamesExpanded((current) => !current)
                }}
              >
                <Icon className="size-5" stroke={1.8} aria-hidden="true" />
                <span>{t(`forum.channels.${key}`)}</span>
                {key === 'games' && (
                  <IconChevronDown className="forum-channel-chevron size-4" stroke={1.8} aria-hidden="true" />
                )}
              </button>
            ))}

            {gamesExpanded && (
              <div className="forum-game-list">
                {sites.map((site) => (
                  <button
                    key={site.id}
                    type="button"
                    className={gameFilter === site.id ? 'is-active' : undefined}
                    aria-pressed={gameFilter === site.id}
                    onClick={() => {
                      setChannel('games')
                      setGameFilter(site.id)
                      setCurrentPage(1)
                      setSelectedPostId(null)
                    }}
                  >
                    <span className="forum-game-logo" aria-hidden="true">
                      <img src={GAME_LOGOS[site.id]} alt="" />
                    </span>
                    {t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })}
                  </button>
                ))}
              </div>
            )}
          </nav>

          <div className="forum-panel forum-community-note">
            <strong>{t('forum.community.title')}</strong>
            <p>{t('forum.community.description')}</p>
          </div>
        </aside>

        <section className="forum-content-column">
          {selectedPost ? (
            <ForumPostDetail
              post={selectedPost}
              images={selectedPost.imageSrcs?.length
                ? selectedPost.imageSrcs
                : [selectedPost.imageSrc ?? (!selectedPost.own && selectedPost.gameId
                    ? siteById.get(selectedPost.gameId)?.bg
                    : undefined)].filter((image): image is string => Boolean(image))}
              onBack={closePost}
              onComingSoon={onComingSoon}
              onAuthRequired={onAuthRequired}
              currentAvatar={currentAvatar}
            />
          ) : (
            <>
              {renderSearch('forum-content-search')}

              <button type="button" className="forum-mobile-compose" onClick={() => compose('body')}>
                <IconPencil className="size-4" stroke={1.8} aria-hidden="true" />
                {t('forum.composer.action')}
              </button>

              <section className="forum-pinned-section">
            <div className="forum-pinned-grid">
              <article className="forum-pinned-feature">
                {siteById.get('aion2') && (
                  <img src={siteById.get('aion2')?.bg} alt="" aria-hidden="true" />
                )}
                <span className="forum-pinned-shade" aria-hidden="true" />
                <div>
                  <span className="forum-pin-label">
                    <IconPinFilled className="size-4" stroke={1.8} aria-hidden="true" />
                    {t('forum.pinned.community.label')}
                  </span>
                  <h3>{t('forum.pinned.community.title')}</h3>
                  <p>{t('forum.pinned.community.description')}</p>
                  <small>{t('forum.pinned.community.meta')}</small>
                </div>
              </article>

              <div className="forum-pinned-list">
                <article>
                  <span>{t('forum.pinned.vrising.label')}</span>
                  <h3>{t('forum.pinned.vrising.title')}</h3>
                  <small>{t('forum.pinned.vrising.meta')}</small>
                </article>
                <article>
                  <span>{t('forum.pinned.aion2.label')}</span>
                  <h3>{t('forum.pinned.aion2.title')}</h3>
                  <small>{t('forum.pinned.aion2.meta')}</small>
                </article>
              </div>
            </div>
              </section>

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

              {visiblePosts.length > 0 ? (
                <>
                  <div className="forum-post-list">
                    {paginatedPosts.map((post) => (
                      <ForumPostCard
                        key={post.id}
                        post={post}
                        image={post.imageSrcs?.[0] ?? post.imageSrc ?? (!post.own && post.gameId
                          ? siteById.get(post.gameId)?.bg
                          : undefined)}
                        followed={userSystemState.followedUserIds.includes(post.authorNumber)}
                        bookmarked={userSystemState.bookmarkedPostIds.includes(post.id)}
                        liked={userSystemState.likedPostIds.includes(post.id)}
                        onToggleFollow={() => toggleFollow(post.authorNumber)}
                        onToggleBookmark={() => runAuthenticated(() => toggleBookmarkedPost(post.id))}
                        onToggleLike={() => runAuthenticated(() => toggleLikedPost(post.id))}
                        onOpen={() => openPost(post.id)}
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
        </section>

        <aside className="forum-right-rail" aria-label={t('forum.sidebar.label')}>
          {selectedPost ? (
            <ForumAuthorPostcard
              post={selectedPost}
              followed={userSystemState.followedUserIds.includes(selectedPost.authorNumber)}
              onToggleFollow={() => toggleFollow(selectedPost.authorNumber)}
            />
          ) : (
            <>
              {renderSearch('forum-right-search')}

              <section className="forum-panel forum-composer">
            <div className="forum-composer-entry">
              <img src={currentAvatar} alt={user?.name ?? ''} />
              <button type="button" onClick={() => compose('body')}>{t('forum.composer.placeholder')}</button>
            </div>
            <div className="forum-composer-tools">
              <button type="button" aria-label={t('forum.composer.image')} onClick={() => compose('image')}>
                <IconPhoto className="size-5" stroke={1.8} />
              </button>
              <button type="button" aria-label={t('forum.composer.video')} onClick={() => compose('video')}>
                <IconVideo className="size-5" stroke={1.8} />
              </button>
              <button type="button" aria-label={t('forum.composer.topic')} onClick={() => compose('topic')}>
                <IconHash className="size-5" stroke={1.8} />
              </button>
              <button type="button" className="forum-publish-button" onClick={() => compose('body')}>
                <IconPencil className="size-4" stroke={1.8} aria-hidden="true" />
                {t('forum.composer.action')}
              </button>
            </div>
              </section>
            </>
          )}

          <section className="forum-panel forum-recommended-users">
            <header>
              <h2>{t('forum.users.title')}</h2>
              <button type="button" onClick={onComingSoon}>
                <IconRefresh className="size-4" stroke={1.8} aria-hidden="true" />
                {t('forum.users.refresh')}
              </button>
            </header>
            <div>
              {RECOMMENDED_USERS.map((user) => {
                const followed = userSystemState.followedUserIds.includes(user.id)
                return (
                  <article key={user.id}>
                    <img src={avatarUrl(user.avatarSeed)} alt="" loading="lazy" />
                    <span>
                      {/* Linked only when a profile actually exists: these four
                          have no fixture, and the lookup used to answer an
                          unknown id with some other person's page. */}
                      <strong>
                        {findPublicProfile(user.id)
                          ? <a href={publicProfileHref(user.id)}>{t(user.nameKey)}</a>
                          : t(user.nameKey)}
                      </strong>
                      <small>{t(user.descriptionKey)}</small>
                    </span>
                    <button
                      type="button"
                      className={followed ? 'is-followed' : undefined}
                      aria-pressed={followed}
                      onClick={() => toggleFollow(user.id)}
                    >
                      {t(followed ? 'forum.users.following' : 'forum.users.follow')}
                    </button>
                  </article>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
      </main>
      {publishNotice && (
        <div className="forum-publish-toast" role="status">
          <IconCheck className="size-5" stroke={2} aria-hidden="true" />
          {t('forum.composer.published')}
        </div>
      )}
    </>
  )
}

interface ForumComposerDraft {
  title: string
  content: string
  gameIds: string[]
  topics: Array<(typeof COMPOSER_TOPICS)[number]>
  customTags: string[]
  videoUrl: string
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0)} KB`
}

function ForumComposerPage({
  focus,
  sites,
  initialGameId,
  avatarSrc,
  authorName,
  signedIn,
  onAuthRequired,
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
  onCancel: () => void
  onPublish: (post: LocalForumPost) => void
}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const draftRecord = useMemo(() => defineMemoryRecord({
    id: 'post-v2', namespace: 'site', surface: 'forum-editor',
    ...memoryPolicy.taskDraft('discard-forum-draft'),
    schemaVersion: '2.0.0',
    defaultValue: (): ForumComposerDraft => ({
      title: '',
      content: '',
      gameIds: initialGameId ? [initialGameId] : [],
      topics: ['discussion'],
      customTags: [],
      videoUrl: '',
    }),
    validate: (value: unknown): value is ForumComposerDraft => {
      if (!value || typeof value !== 'object') return false
      const draft = value as Partial<ForumComposerDraft>
      return typeof draft.title === 'string' && draft.title.length <= 80
        && typeof draft.content === 'string' && draft.content.length <= 5_000
        && Array.isArray(draft.gameIds) && draft.gameIds.length <= FORUM_GAME_MAX_COUNT
        && draft.gameIds.every((item) => typeof item === 'string')
        && Array.isArray(draft.topics) && draft.topics.length <= FORUM_TAG_MAX_COUNT
        && draft.topics.every((item) => COMPOSER_TOPICS.includes(item))
        && Array.isArray(draft.customTags) && draft.customTags.length <= FORUM_TAG_MAX_COUNT
        && draft.customTags.every((item) => typeof item === 'string' && item.length <= 24)
        && typeof draft.videoUrl === 'string' && draft.videoUrl.length <= 2_000
    },
    partition: { account: true },
    signInAdoption: 'keep_anonymous',
  }), [initialGameId])
  // The 4th element is the real write status. Discarding it meant the green check
  // showed before anything was typed AND when the write had been refused (blocked
  // storage, or over the record's byte cap).
  const [draft, setDraft, clearDraft, draftStatus] = useMemoryState(draftRecord, {
    accountId: user?.id,
    partition: initialGameId ?? 'all',
    debounceMs: 300,
  })
  const [title, setTitle] = useState(draft.title)
  const [content, setContent] = useState(draft.content)
  const [gameIds, setGameIds] = useState(draft.gameIds)
  const [topics, setTopics] = useState(draft.topics)
  const [customTags, setCustomTags] = useState(draft.customTags)
  const [gameQuery, setGameQuery] = useState('')
  const [tagQuery, setTagQuery] = useState('')
  const [gameInputActive, setGameInputActive] = useState(false)
  const [tagInputActive, setTagInputActive] = useState(false)
  const [gameActiveIndex, setGameActiveIndex] = useState(0)
  const [tagActiveIndex, setTagActiveIndex] = useState(0)
  const [images, setImages] = useState<ComposerImage[]>([])
  const [pendingImages, setPendingImages] = useState<ComposerImage[]>([])
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [videoDialogOpen, setVideoDialogOpen] = useState(false)
  const [videoUrl, setVideoUrl] = useState(draft.videoUrl)
  const [videoInput, setVideoInput] = useState(draft.videoUrl)
  const [parsedVideoUrl, setParsedVideoUrl] = useState(draft.videoUrl)
  const [videoError, setVideoError] = useState('')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const draggedImageIndex = useRef<number | null>(null)

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

  useEffect(() => {
    setDraft({ title, content, gameIds, topics, customTags, videoUrl })
  }, [content, customTags, gameIds, setDraft, title, topics, videoUrl])

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
        setImageDialogOpen(true)
      } else if (focus === 'video') {
        setVideoDialogOpen(true)
      } else if (focus === 'topic') {
        tagInputRef.current?.focus()
      } else {
        titleRef.current?.focus()
      }
    })
    return () => window.clearTimeout(timeout)
  }, [focus])

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

  const selectImages = async (files: File[]) => {
    const available = FORUM_IMAGE_MAX_COUNT - pendingImages.length
    const candidates = files.slice(0, available)
    const existingBytes = pendingImages.reduce((total, image) => total + image.size, 0)
    const valid = candidates.every((file) => FORUM_IMAGE_TYPES.has(file.type) && file.size <= FORUM_IMAGE_MAX_BYTES)
      && existingBytes + candidates.reduce((total, file) => total + file.size, 0) <= FORUM_IMAGE_TOTAL_MAX_BYTES
    if (!valid || candidates.length === 0) {
      setError(t('forum.composer.errors.image'))
      return
    }
    try {
      const nextImages = await Promise.all(candidates.map(async (file) => ({
        id: `${Date.now()}-${localPostSuffix()}-${file.name}`,
        src: await readForumImage(file),
        name: file.name,
        size: file.size,
      })))
      setPendingImages((current) => [...current, ...nextImages])
      setError('')
    } catch {
      setError(t('forum.composer.errors.image'))
    }
  }

  const handleImageInput = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''
    void selectImages(files)
  }

  const handleImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void selectImages(Array.from(event.dataTransfer.files))
  }

  const movePendingImage = (index: number, offset: number) => {
    const target = index + offset
    if (target < 0 || target >= pendingImages.length) return
    setPendingImages((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const dropPendingImage = (targetIndex: number) => {
    const sourceIndex = draggedImageIndex.current
    draggedImageIndex.current = null
    if (sourceIndex === null || sourceIndex === targetIndex) return
    setPendingImages((current) => {
      const next = [...current]
      const [item] = next.splice(sourceIndex, 1)
      next.splice(targetIndex, 0, item)
      return next
    })
  }

  const openImageDialog = () => {
    setPendingImages(images)
    setImageDialogOpen(true)
    setError('')
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!signedIn) {
      onAuthRequired()
      return
    }
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

    const imageSrcs = images.map((image) => image.src)
    onPublish({
      id: `local-${Date.now()}-${localPostSuffix()}`,
      title: normalizedTitle,
      content: normalizedContent,
      channel: gameIds.length > 0 ? 'games' : 'general',
      gameId: gameIds[0] ?? null,
      gameIds,
      topic: topics[0] ?? 'discussion',
      topics,
      tags: customTags,
      imageSrc: imageSrcs[0] ?? null,
      imageSrcs,
      videoUrl: videoUrl || null,
      createdAt: new Date().toISOString(),
    })
    clearDraft()
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
          <span role="status" aria-live="polite">
            {draftStatus === 'failed'
              ? t('userSystem.account.errors.saveFailed')
              : draftStatus === 'saved'
                ? <><IconCheck className="size-4" stroke={2} aria-hidden="true" />{t('forum.composer.draftSaved')}</>
                : null}
          </span>
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
            <textarea
              ref={contentRef}
              id="forum-post-content"
              value={content}
              maxLength={5_000}
              onChange={(event) => { setContent(event.target.value); setError('') }}
              placeholder={t('forum.composer.contentPlaceholder')}
            />
            {images.length > 0 && (
              <div className="forum-editor-media-grid">
                {images.map((image) => (
                  <figure key={image.id}>
                    <img src={image.src} alt={image.name} />
                    <figcaption>{image.name}</figcaption>
                    <button type="button" aria-label={t('forum.composer.removeImage')} onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}>
                      <IconX className="size-4" stroke={2} aria-hidden="true" />
                    </button>
                  </figure>
                ))}
              </div>
            )}
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
            <span role="status" aria-live="polite">
            {draftStatus === 'failed'
              ? t('userSystem.account.errors.saveFailed')
              : draftStatus === 'saved'
                ? <><IconCheck className="size-4" stroke={2} aria-hidden="true" />{t('forum.composer.draftSaved')}</>
                : null}
          </span>
            <strong role="alert">{error}</strong>
          </div>
          <button type="button" className="forum-publish-cancel" onClick={onCancel}>{t('forum.composer.cancel')}</button>
          <button type="submit" className="forum-publish-submit">
            <IconPencil className="size-4" stroke={1.8} aria-hidden="true" />
            {t('forum.composer.publish')}
          </button>
        </footer>
      </form>

      <Dialog open={imageDialogOpen} onOpenChange={setImageDialogOpen}>
        <DialogContent className="forum-media-dialog forum-image-dialog z-[var(--arkive-layer-sheet)]" overlayClassName="z-[var(--arkive-layer-sheet-backdrop)]" showCloseButton={false}>
          <DialogHeader className="forum-media-dialog-header">
            <DialogTitle>{t('forum.composer.imageDialogTitle')}</DialogTitle>
            <DialogDescription className="sr-only">{t('forum.composer.imageDialogDescription')}</DialogDescription>
            <DialogClose asChild><button type="button" className={POPUP_CLOSE_CONTROL_CLASS} aria-label={t('forum.composer.closeMediaDialog')}><IconX className="size-5" stroke={1.8} /></button></DialogClose>
          </DialogHeader>
          <input ref={imageInputRef} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={handleImageInput} />
          <div className="forum-image-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleImageDrop}>
            <IconUpload className="size-7" stroke={1.5} aria-hidden="true" />
            <strong>{t('forum.composer.imageDropTitle')}</strong>
            <button type="button" onClick={() => imageInputRef.current?.click()}>{t('forum.composer.chooseImages')}</button>
            <small>{t('forum.composer.imageRules')}</small>
          </div>
          <div className="forum-image-queue">
            <h3>{t('forum.composer.pendingImages', { count: pendingImages.length })}</h3>
            {pendingImages.length > 0 ? (
              <div>
                {pendingImages.map((image, index) => (
                  <article key={image.id} draggable onDragStart={() => { draggedImageIndex.current = index }} onDragOver={(event) => event.preventDefault()} onDrop={() => dropPendingImage(index)}>
                    <img src={image.src} alt="" />
                    <span><strong>{image.name}</strong><small>{formatFileSize(image.size)}</small></span>
                    <IconCheck className="size-4" stroke={2} aria-label={t('forum.composer.uploadComplete')} />
                    <div>
                      <button type="button" disabled={index === 0} aria-label={t('forum.composer.moveImageUp')} onClick={() => movePendingImage(index, -1)}><IconArrowUp className="size-4" stroke={1.8} /></button>
                      <button type="button" disabled={index === pendingImages.length - 1} aria-label={t('forum.composer.moveImageDown')} onClick={() => movePendingImage(index, 1)}><IconArrowDown className="size-4" stroke={1.8} /></button>
                      <button type="button" aria-label={t('forum.composer.removeImage')} onClick={() => setPendingImages((current) => current.filter((item) => item.id !== image.id))}><IconTrash className="size-4" stroke={1.8} /></button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p>{t('forum.composer.noPendingImages')}</p>}
          </div>
          <DialogFooter className="forum-media-dialog-footer">
            <span>{t('forum.composer.selectedImages', { count: pendingImages.length, max: FORUM_IMAGE_MAX_COUNT })}</span>
            <DialogClose asChild><button type="button" className="forum-publish-cancel">{t('forum.composer.cancel')}</button></DialogClose>
            <button type="button" className="forum-publish-submit" disabled={pendingImages.length === 0 && images.length === 0} onClick={() => { setImages(pendingImages); setImageDialogOpen(false) }}>
              {t('forum.composer.insertImages', { count: pendingImages.length })}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <input id="forum-video-link" type="url" value={videoInput} onChange={(event) => { setVideoInput(event.target.value); setParsedVideoUrl(''); setVideoError('') }} placeholder={t('forum.composer.videoPlaceholder')} />
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
}) {
  const { t } = useTranslation()

  return (
    <article className="forum-post">
      <img className="forum-post-avatar" src={post.avatarSrc ?? avatarUrl(post.avatarSeed)} alt="" loading="lazy" />
      <div className="forum-post-content">
        <div className="forum-post-author">
          <strong><a href={post.own ? '#account/posts' : publicProfileHref(post.authorNumber)}>{postAuthor(post, t)}</a></strong>
          {post.featured && <span>{t('forum.feed.qualityAuthor')}</span>}
          <small>{postTime(post, t)}</small>
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
        </div>
        <button
          type="button"
          className="forum-post-title"
          aria-label={t('forum.detail.openPost', { title: postTitle(post, t) })}
          onClick={onOpen}
        >
          <h3>{postTitle(post, t)}</h3>
        </button>
        <p>{postCopy(post, t)}</p>
        <div className="forum-post-tags">
          {postTags(post, t).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        {image && <img className="forum-post-media" src={image} alt={postTitle(post, t)} loading="lazy" />}
        {post.videoUrl && (
          <a className="forum-post-video" href={post.videoUrl} target="_blank" rel="noreferrer">
            <IconVideo className="size-4" stroke={1.8} aria-hidden="true" />
            {t('forum.composer.openVideo')}
          </a>
        )}
      </div>
      <div className="forum-post-actions">
        <button type="button" aria-label={t('forum.actions.bookmark')} aria-pressed={bookmarked} onClick={onToggleBookmark}>
          <IconBookmark className="size-4" stroke={1.8} />
        </button>
        <button type="button" aria-label={t('forum.actions.like')} aria-pressed={liked} onClick={onToggleLike}>
          <IconThumbUp className="size-4" stroke={1.8} />
        </button>
      </div>
    </article>
  )
}

function ForumPostDetail({
  post,
  images,
  onBack,
  onComingSoon,
  onAuthRequired,
  currentAvatar,
}: {
  post: ForumPost
  images: string[]
  onBack: () => void
  onComingSoon: () => void
  onAuthRequired: () => void
  currentAvatar: string
}) {
  const { t, i18n } = useTranslation()
  const { status, user } = useAuth()
  const {
    state,
    toggleBookmarkedPost,
    toggleLikedComment,
    toggleLikedPost,
  } = useUserSystem()
  const liked = state.likedPostIds.includes(post.id)
  const bookmarked = state.bookmarkedPostIds.includes(post.id)
  const commentId = `${post.id}:sample-comment`
  const commentLiked = state.likedCommentIds.includes(commentId)
  const numberFormatter = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language)
  const formatCount = (count: number) => numberFormatter.format(count)
  const discussionId = `forum-discussion-${post.id}`
  const runAuthenticated = (action: () => void) => {
    if (status !== 'authenticated') {
      onAuthRequired()
      return
    }
    action()
  }

  return (
    <div className="forum-detail-stack">
      <button type="button" className="forum-detail-back" onClick={onBack}>
        <IconArrowLeft className="size-4" stroke={1.8} aria-hidden="true" />
        {t('forum.detail.back')}
      </button>

      <article className="forum-panel forum-detail-article">
        <header>
          <h1>{postTitle(post, t)}</h1>
          <div className="forum-detail-byline">
            <img src={post.avatarSrc ?? avatarUrl(post.avatarSeed)} alt="" />
            <div>
              <strong><a href={post.own ? '#account/posts' : publicProfileHref(post.authorNumber)}>{postAuthor(post, t)}</a></strong>
              <span>{t('forum.detail.byline', { time: postTime(post, t) })}</span>
            </div>
          </div>
          <div className="forum-detail-tags">
            {postTags(post, t).map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        </header>

        <div className="forum-detail-body">
          <p className="forum-detail-lead">{postCopy(post, t)}</p>
          {images.length > 0 && (
            <div className="forum-detail-media-grid">
              {images.map((image, index) => (
                <img key={`${image.slice(0, 48)}-${index}`} src={image} alt={postTitle(post, t)} loading={index === 0 ? 'eager' : 'lazy'} />
              ))}
            </div>
          )}
          {post.videoUrl && (
            <a className="forum-detail-video" href={post.videoUrl} target="_blank" rel="noreferrer">
              <IconVideo className="size-5" stroke={1.8} aria-hidden="true" />
              {t('forum.composer.openVideo')}
            </a>
          )}
          {!post.own && <p>{t('forum.detail.continuation')}</p>}
        </div>

        <footer className="forum-detail-actions">
          <button
            type="button"
            onClick={() => document.getElementById(discussionId)?.scrollIntoView({ behavior: 'auto', block: 'start' })}
          >
            <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.detail.comments')}</span>
            <strong>{formatCount(post.commentCount)}</strong>
          </button>
          <button type="button" aria-pressed={liked} onClick={() => runAuthenticated(() => toggleLikedPost(post.id))}>
            <IconThumbUp className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.detail.like')}</span>
            <strong>{formatCount(post.likeCount + (liked ? 1 : 0))}</strong>
          </button>
          <button type="button" aria-pressed={bookmarked} onClick={() => runAuthenticated(() => toggleBookmarkedPost(post.id))}>
            <IconBookmark className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.detail.bookmark')}</span>
            <strong>{formatCount(post.bookmarkCount + (bookmarked ? 1 : 0))}</strong>
          </button>
        </footer>
      </article>

      <section id={discussionId} className="forum-panel forum-detail-discussion">
        <header>
          <div>
            <IconMessageCircle className="size-5" stroke={1.8} aria-hidden="true" />
            <h2>{t('forum.detail.discussion')}</h2>
          </div>
          <span>{t('forum.detail.discussionCount', { count: post.commentCount })}</span>
        </header>
        <div className="forum-detail-composer">
          <img src={currentAvatar} alt={user?.name ?? ''} />
          <button type="button" onClick={() => runAuthenticated(onComingSoon)}>{t('forum.detail.replyPlaceholder')}</button>
        </div>

        {post.commentCount > 0 ? (
          <article className="forum-comment-thread">
          <div className="forum-comment-main">
            <img src={avatarUrl('arkive-mistshore-notes')} alt="" />
            <div>
              <header>
                <strong>{t('forum.detail.sampleCommentAuthor')}</strong>
                <time>{t('forum.detail.sampleCommentTime')}</time>
              </header>
              <p>{t('forum.detail.sampleComment')}</p>
              <footer>
                <button
                  type="button"
                  aria-label={t('forum.detail.commentLikeLabel')}
                  aria-pressed={commentLiked}
                  onClick={() => runAuthenticated(() => toggleLikedComment(commentId))}
                >
                  <IconThumbUp className="size-4" stroke={1.8} aria-hidden="true" />
                  <span>{formatCount(12 + (commentLiked ? 1 : 0))}</span>
                </button>
                <button type="button" onClick={() => runAuthenticated(onComingSoon)}>
                  <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
                  {t('forum.detail.reply')}
                </button>
              </footer>

              <div className="forum-comment-reply">
                <img src={post.avatarSrc ?? avatarUrl(post.avatarSeed)} alt="" />
                <div>
                  <header>
                    <strong>{postAuthor(post, t)}</strong>
                    <span className="forum-comment-author-badge">{t('forum.detail.authorBadge')}</span>
                    <span>{t('forum.detail.replyingTo', { name: t('forum.detail.sampleCommentAuthor') })}</span>
                    <time>{t('forum.detail.sampleReplyTime')}</time>
                  </header>
                  <p>{t('forum.detail.sampleReply')}</p>
                </div>
              </div>
            </div>
          </div>
          </article>
        ) : (
          <p className="forum-comment-empty">{t('forum.detail.noComments')}</p>
        )}
      </section>
    </div>
  )
}

function ForumAuthorPostcard({
  post,
  followed,
  onToggleFollow,
}: {
  post: ForumPost
  followed: boolean
  onToggleFollow: () => void
}) {
  const { t, i18n } = useTranslation()
  const headingId = `forum-author-${post.id}`
  const followerCount = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language).format(post.followerCount)

  return (
    <section className="forum-panel forum-author-postcard" aria-labelledby={headingId}>
      <div className="forum-author-postcard-cover" aria-hidden="true" />
      <div className="forum-author-postcard-identity">
        <img src={post.avatarSrc ?? avatarUrl(post.avatarSeed)} alt="" />
        <div>
          <h2 id={headingId}><a href={post.own ? '#account/posts' : publicProfileHref(post.authorNumber)}>{postAuthor(post, t)}</a></h2>
          {post.featured && <small>{t('forum.feed.qualityAuthor')}</small>}
        </div>
      </div>
      <dl>
        <div>
          <dt>{t('forum.detail.accountId')}</dt>
          <dd>{post.authorNumber}</dd>
        </div>
        <div>
          <dt>{t('forum.detail.followers')}</dt>
          <dd>{followerCount}</dd>
        </div>
      </dl>
      <p>{t('forum.detail.authorBio', { topic: postTags(post, t)[0] ?? t('forum.channels.general') })}</p>
      {!post.own && (
        <button
          type="button"
          className={followed ? 'is-followed' : undefined}
          aria-pressed={followed}
          onClick={onToggleFollow}
        >
          {t(followed ? 'forum.users.following' : 'forum.users.follow')}
        </button>
      )}
    </section>
  )
}
