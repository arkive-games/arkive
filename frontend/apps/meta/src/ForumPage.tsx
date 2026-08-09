import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import type { TFunction } from 'i18next'
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
} from '@gamemap/ui'
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconBookmark,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconDeviceGamepad2,
  IconFlame,
  IconHash,
  IconMessageCircle,
  IconMessages,
  IconPhoto,
  IconPinFilled,
  IconPencil,
  IconRefresh,
  IconSearch,
  IconSpeakerphone,
  IconThumbUp,
  IconTrash,
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

function isSafeVideoUrl(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
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
  const [composerOpen, setComposerOpen] = useState(false)
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
    author: user?.name ?? '',
    timeKey: 'forum.time.today',
    title: post.title,
    copy: post.content,
    tags: [
      ...(post.gameId ? [t(`forum.games.${post.gameId}`)] : []),
      t(`forum.composer.topics.${post.topic}`),
    ],
    avatarSeed: user?.id ?? 'arkive-anonymous',
    avatarSrc: currentAvatar,
    authorNumber: user?.id ?? '',
    followerCount: 0,
    commentCount: 0,
    likeCount: 0,
    bookmarkCount: 0,
    imageSrc: post.imageSrc ?? undefined,
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
      if (gameFilter && post.gameId !== gameFilter) return false
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
    if (!signedIn) {
      onAuthRequired()
      return
    }
    setComposerFocus(focus)
    setComposerOpen(true)
  }

  const publish = (post: LocalForumPost) => {
    publishForumPost(post)
    setComposerOpen(false)
    setPublishNotice(true)
    setChannel(post.channel)
    setGameFilter(post.gameId)
    setFeedTab('recommended')
    setCurrentPage(1)
    setSelectedPostId(post.id)
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
              image={selectedPost.imageSrc ?? (!selectedPost.own && selectedPost.gameId
                ? siteById.get(selectedPost.gameId)?.bg
                : undefined)}
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

              <section className="forum-feed-section">
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
                        image={post.imageSrc ?? (!post.own && post.gameId
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
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
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
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </button>
                      ))}
                      <button
                        type="button"
                        aria-label={t('forum.pagination.next')}
                        disabled={activePage === totalPages}
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
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
      <ForumComposerDialog
        open={composerOpen}
        focus={composerFocus}
        sites={sites}
        initialChannel={channel === 'games' || gameFilter ? 'games' : 'general'}
        initialGameId={gameFilter}
        avatarSrc={currentAvatar}
        authorName={user?.name ?? ''}
        onOpenChange={setComposerOpen}
        onPublish={publish}
      />
      {publishNotice && (
        <div className="forum-publish-toast" role="status">
          <IconCheck className="size-5" stroke={2} aria-hidden="true" />
          {t('forum.composer.published')}
        </div>
      )}
    </>
  )
}

function ForumComposerDialog({
  open,
  focus,
  sites,
  initialChannel,
  initialGameId,
  avatarSrc,
  authorName,
  onOpenChange,
  onPublish,
}: {
  open: boolean
  focus: ComposerFocus
  sites: readonly SiteCard[]
  initialChannel: 'general' | 'games'
  initialGameId: string | null
  avatarSrc: string
  authorName: string
  onOpenChange: (open: boolean) => void
  onPublish: (post: LocalForumPost) => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [channel, setChannel] = useState<'general' | 'games'>(initialChannel)
  const [gameId, setGameId] = useState<string | null>(initialGameId)
  const [topic, setTopic] = useState<(typeof COMPOSER_TOPICS)[number]>('discussion')
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const imageButtonRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)
  const topicRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setContent('')
    setChannel(initialChannel)
    setGameId(initialGameId)
    setTopic('discussion')
    setImageSrc(null)
    setImageName('')
    setVideoUrl('')
    setError('')
  }, [initialChannel, initialGameId, open])

  useEffect(() => {
    if (!open) return
    const timeout = window.setTimeout(() => {
      if (focus === 'image') imageButtonRef.current?.focus()
      else if (focus === 'video') videoRef.current?.focus()
      else if (focus === 'topic') topicRef.current?.focus()
      else titleRef.current?.focus()
    })
    return () => window.clearTimeout(timeout)
  }, [focus, open])

  const selectImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (!FORUM_IMAGE_TYPES.has(file.type) || file.size > FORUM_IMAGE_MAX_BYTES) {
      setError(t('forum.composer.errors.image'))
      return
    }
    try {
      setImageSrc(await readForumImage(file))
      setImageName(file.name)
      setError('')
    } catch {
      setError(t('forum.composer.errors.image'))
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedTitle = title.trim()
    const normalizedContent = content.trim()
    const normalizedVideoUrl = videoUrl.trim()
    if (normalizedTitle.length < 2) {
      setError(t('forum.composer.errors.title'))
      titleRef.current?.focus()
      return
    }
    if (normalizedContent.length < 10) {
      setError(t('forum.composer.errors.content'))
      return
    }
    if (channel === 'games' && !gameId) {
      setError(t('forum.composer.errors.game'))
      return
    }
    if (!isSafeVideoUrl(normalizedVideoUrl)) {
      setError(t('forum.composer.errors.video'))
      videoRef.current?.focus()
      return
    }

    onPublish({
      id: `local-${Date.now()}-${localPostSuffix()}`,
      title: normalizedTitle,
      content: normalizedContent,
      channel,
      gameId: channel === 'games' ? gameId : null,
      topic,
      imageSrc,
      videoUrl: normalizedVideoUrl || null,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="forum-publish-dialog z-[3001]"
        overlayClassName="z-[3000] bg-black/55 backdrop-blur-sm"
        showCloseButton={false}
      >
        <form className="forum-publish-form" onSubmit={submit}>
          <DialogHeader className="forum-publish-header">
            <img src={avatarSrc} alt="" />
            <div>
              <DialogTitle>{t('forum.composer.dialogTitle')}</DialogTitle>
              <DialogDescription className="sr-only">{t('forum.composer.dialogDescription')}</DialogDescription>
              <span>{authorName}</span>
            </div>
            <DialogClose asChild>
              <button type="button" className="forum-publish-close" aria-label={t('forum.composer.close')}>
                <IconX className="size-5" stroke={1.8} aria-hidden="true" />
              </button>
            </DialogClose>
          </DialogHeader>

          <div className="forum-publish-layout">
            <div className="forum-publish-editor">
              <label htmlFor="forum-post-title">
                <span>{t('forum.composer.postTitle')}</span>
                <small>{title.length}/80</small>
              </label>
              <input
                ref={titleRef}
                id="forum-post-title"
                value={title}
                maxLength={80}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setError('')
                }}
                placeholder={t('forum.composer.postTitlePlaceholder')}
              />

              <label htmlFor="forum-post-content">
                <span>{t('forum.composer.content')}</span>
                <small>{content.length}/5000</small>
              </label>
              <textarea
                id="forum-post-content"
                value={content}
                maxLength={5000}
                onChange={(event) => {
                  setContent(event.target.value)
                  setError('')
                }}
                placeholder={t('forum.composer.contentPlaceholder')}
              />

              {imageSrc && (
                <figure className="forum-publish-image-preview">
                  <img src={imageSrc} alt={imageName} />
                  <figcaption>{imageName}</figcaption>
                  <button
                    type="button"
                    aria-label={t('forum.composer.removeImage')}
                    onClick={() => {
                      setImageSrc(null)
                      setImageName('')
                    }}
                  >
                    <IconTrash className="size-4" stroke={1.8} aria-hidden="true" />
                  </button>
                </figure>
              )}
            </div>

            <aside className="forum-publish-settings">
              <fieldset>
                <legend>{t('forum.composer.destination')}</legend>
                <div className="forum-publish-channel-options">
                  {(['general', 'games'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={channel === value}
                      onClick={() => {
                        setChannel(value)
                        setError('')
                      }}
                    >
                      {value === 'general'
                        ? <IconMessages className="size-5" stroke={1.8} aria-hidden="true" />
                        : <IconDeviceGamepad2 className="size-5" stroke={1.8} aria-hidden="true" />}
                      {t(`forum.composer.channels.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {channel === 'games' && (
                <fieldset>
                  <legend>{t('forum.composer.selectGame')}</legend>
                  <div className="forum-publish-game-options">
                    {sites.map((site) => (
                      <button
                        key={site.id}
                        type="button"
                        aria-pressed={gameId === site.id}
                        onClick={() => {
                          setGameId(site.id)
                          setError('')
                        }}
                      >
                        <img src={GAME_LOGOS[site.id]} alt="" />
                        <span>{t(`forum.games.${site.id}`, { defaultValue: t(site.nameKey) })}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              <fieldset>
                <legend>{t('forum.composer.topicLabel')}</legend>
                <div className="forum-publish-topic-options">
                  {COMPOSER_TOPICS.map((value, index) => (
                    <button
                      ref={index === 0 ? topicRef : undefined}
                      key={value}
                      type="button"
                      aria-pressed={topic === value}
                      onClick={() => setTopic(value)}
                    >
                      <IconHash className="size-4" stroke={1.8} aria-hidden="true" />
                      {t(`forum.composer.topics.${value}`)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>{t('forum.composer.media')}</legend>
                <input
                  ref={imageInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void selectImage(event)}
                />
                <button
                  ref={imageButtonRef}
                  type="button"
                  className="forum-publish-media-button"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <IconPhoto className="size-5" stroke={1.8} aria-hidden="true" />
                  {t(imageSrc ? 'forum.composer.replaceImage' : 'forum.composer.image')}
                </button>
                <label className="forum-publish-video-field" htmlFor="forum-post-video">
                  <span><IconVideo className="size-5" stroke={1.8} aria-hidden="true" />{t('forum.composer.video')}</span>
                  <input
                    ref={videoRef}
                    id="forum-post-video"
                    type="url"
                    value={videoUrl}
                    onChange={(event) => {
                      setVideoUrl(event.target.value)
                      setError('')
                    }}
                    placeholder={t('forum.composer.videoPlaceholder')}
                  />
                </label>
              </fieldset>
            </aside>
          </div>

          <DialogFooter className="forum-publish-footer">
            <span className="forum-publish-error" role="alert">{error}</span>
            <DialogClose asChild>
              <button type="button" className="forum-publish-cancel">{t('forum.composer.cancel')}</button>
            </DialogClose>
            <button type="submit" className="forum-publish-submit">
              <IconPencil className="size-4" stroke={1.8} aria-hidden="true" />
              {t('forum.composer.publish')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  image,
  onBack,
  onComingSoon,
  onAuthRequired,
  currentAvatar,
}: {
  post: ForumPost
  image?: string
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
          {image && <img src={image} alt={postTitle(post, t)} loading="eager" />}
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
