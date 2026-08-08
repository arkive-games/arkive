import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconBookmark,
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
  IconVideo,
} from '@tabler/icons-react'
import type { SiteCard } from './sites'
import aion2Logo from './assets/aion2-logo.webp'
import palworldLogo from './assets/palworld-logo.png'
import sts2Logo from './assets/sts2-logo.png'
import vrisingLogo from './assets/vrising-logo.png'
import './forum.css'

type ForumChannel = 'hot' | 'general' | 'official' | 'games'
type FeedTab = 'recommended' | 'latest' | 'featured'

const POSTS_PER_PAGE = 5
const MAX_VISIBLE_PAGES = 5

interface ForumPageProps {
  sites: readonly SiteCard[]
  onComingSoon: () => void
}

interface ForumPost {
  id: string
  channel: Exclude<ForumChannel, 'hot'>
  gameId?: string
  authorKey: string
  timeKey: string
  titleKey: string
  copyKey: string
  tagKeys: string[]
  avatarSeed: string
  authorNumber: string
  followerCount: number
  commentCount: number
  likeCount: number
  bookmarkCount: number
  featured?: boolean
}

interface RecommendedUser {
  id: string
  nameKey: string
  descriptionKey: string
  avatarSeed: string
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

const RECOMMENDED_USERS: RecommendedUser[] = [
  {
    id: 'white-deer',
    nameKey: 'forum.users.whiteDeer.name',
    descriptionKey: 'forum.users.whiteDeer.description',
    avatarSeed: 'arkive-white-deer',
  },
  {
    id: 'castle-watch',
    nameKey: 'forum.users.castleWatch.name',
    descriptionKey: 'forum.users.castleWatch.description',
    avatarSeed: 'arkive-castle-watch',
  },
  {
    id: 'ranch-duty',
    nameKey: 'forum.users.ranchDuty.name',
    descriptionKey: 'forum.users.ranchDuty.description',
    avatarSeed: 'arkive-ranch-duty',
  },
  {
    id: 'spire-letter',
    nameKey: 'forum.users.spireLetter.name',
    descriptionKey: 'forum.users.spireLetter.description',
    avatarSeed: 'arkive-spire-letter',
  },
]

const GAME_LOGOS: Record<string, string> = {
  aion2: aion2Logo,
  palworld: palworldLogo,
  vrising: vrisingLogo,
  sts2: sts2Logo,
}

function avatarUrl(seed: string) {
  return `https://i.pravatar.cc/128?u=${encodeURIComponent(seed)}`
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

export function ForumPage({ sites, onComingSoon }: ForumPageProps) {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<ForumChannel>('hot')
  const [feedTab, setFeedTab] = useState<FeedTab>('recommended')
  const [gameFilter, setGameFilter] = useState<string | null>(null)
  const [gamesExpanded, setGamesExpanded] = useState(true)
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [followedUsers, setFollowedUsers] = useState<Set<string>>(() => new Set())

  const siteById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites],
  )

  const visiblePosts = useMemo(() => {
    const normalizedQuery = submittedQuery.trim().toLocaleLowerCase()
    const filtered = POSTS.filter((post) => {
      if (channel !== 'hot' && post.channel !== channel) return false
      if (gameFilter && post.gameId !== gameFilter) return false
      if (feedTab === 'featured' && !post.featured) return false
      if (!normalizedQuery) return true

      const searchable = [
        t(post.authorKey),
        t(post.titleKey),
        t(post.copyKey),
        ...post.tagKeys.map((key) => t(key)),
      ].join(' ').toLocaleLowerCase()
      return searchable.includes(normalizedQuery)
    })

    return feedTab === 'latest' ? [...filtered].reverse() : filtered
  }, [channel, feedTab, gameFilter, submittedQuery, t])

  const totalPages = Math.max(1, Math.ceil(visiblePosts.length / POSTS_PER_PAGE))
  const activePage = Math.min(currentPage, totalPages)
  const visiblePageNumbers = getVisiblePageNumbers(activePage, totalPages)
  const paginatedPosts = visiblePosts.slice(
    (activePage - 1) * POSTS_PER_PAGE,
    activePage * POSTS_PER_PAGE,
  )
  const selectedPost = selectedPostId
    ? POSTS.find((post) => post.id === selectedPostId) ?? null
    : null

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
    setFollowedUsers((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
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
              image={selectedPost.gameId ? siteById.get(selectedPost.gameId)?.bg : undefined}
              onBack={closePost}
              onComingSoon={onComingSoon}
            />
          ) : (
            <>
              {renderSearch('forum-content-search')}

              <button type="button" className="forum-mobile-compose" onClick={onComingSoon}>
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
                <button type="button" className="forum-following-filter" onClick={onComingSoon}>
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
                        image={post.gameId ? siteById.get(post.gameId)?.bg : undefined}
                        followed={followedUsers.has(post.authorKey)}
                        onToggleFollow={() => toggleFollow(post.authorKey)}
                        onOpen={() => openPost(post.id)}
                        onComingSoon={onComingSoon}
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
              followed={followedUsers.has(selectedPost.authorKey)}
              onToggleFollow={() => toggleFollow(selectedPost.authorKey)}
            />
          ) : (
            <>
              {renderSearch('forum-right-search')}

              <section className="forum-panel forum-composer">
            <div className="forum-composer-entry">
              <img src={avatarUrl('arkive-current-sailor')} alt="" />
              <button type="button" onClick={onComingSoon}>{t('forum.composer.placeholder')}</button>
            </div>
            <div className="forum-composer-tools">
              <button type="button" aria-label={t('forum.composer.image')} onClick={onComingSoon}>
                <IconPhoto className="size-5" stroke={1.8} />
              </button>
              <button type="button" aria-label={t('forum.composer.video')} onClick={onComingSoon}>
                <IconVideo className="size-5" stroke={1.8} />
              </button>
              <button type="button" aria-label={t('forum.composer.topic')} onClick={onComingSoon}>
                <IconHash className="size-5" stroke={1.8} />
              </button>
              <button type="button" className="forum-publish-button" onClick={onComingSoon}>
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
                const followed = followedUsers.has(user.id)
                return (
                  <article key={user.id}>
                    <img src={avatarUrl(user.avatarSeed)} alt="" loading="lazy" />
                    <span>
                      <strong>{t(user.nameKey)}</strong>
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
  )
}

function ForumPostCard({
  post,
  image,
  followed,
  onToggleFollow,
  onOpen,
  onComingSoon,
}: {
  post: ForumPost
  image?: string
  followed: boolean
  onToggleFollow: () => void
  onOpen: () => void
  onComingSoon: () => void
}) {
  const { t } = useTranslation()

  return (
    <article className="forum-post">
      <img className="forum-post-avatar" src={avatarUrl(post.avatarSeed)} alt="" loading="lazy" />
      <div className="forum-post-content">
        <div className="forum-post-author">
          <strong>{t(post.authorKey)}</strong>
          {post.featured && <span>{t('forum.feed.qualityAuthor')}</span>}
          <small>{t(post.timeKey)}</small>
          <button
            type="button"
            className="forum-post-follow"
            aria-pressed={followed}
            onClick={onToggleFollow}
          >
            {t(followed ? 'forum.users.following' : 'forum.users.follow')}
          </button>
        </div>
        <button
          type="button"
          className="forum-post-title"
          aria-label={t('forum.detail.openPost', { title: t(post.titleKey) })}
          onClick={onOpen}
        >
          <h3>{t(post.titleKey)}</h3>
        </button>
        <p>{t(post.copyKey)}</p>
        <div className="forum-post-tags">
          {post.tagKeys.map((key) => <span key={key}>{t(key)}</span>)}
        </div>
        {image && <img className="forum-post-media" src={image} alt={t(post.titleKey)} loading="lazy" />}
      </div>
      <div className="forum-post-actions">
        <button type="button" aria-label={t('forum.actions.bookmark')} onClick={onComingSoon}>
          <IconBookmark className="size-4" stroke={1.8} />
        </button>
        <button type="button" aria-label={t('forum.actions.like')} onClick={onComingSoon}>
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
}: {
  post: ForumPost
  image?: string
  onBack: () => void
  onComingSoon: () => void
}) {
  const { t, i18n } = useTranslation()
  const [liked, setLiked] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [commentLiked, setCommentLiked] = useState(false)
  const numberFormatter = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language)
  const formatCount = (count: number) => numberFormatter.format(count)
  const discussionId = `forum-discussion-${post.id}`

  return (
    <div className="forum-detail-stack">
      <button type="button" className="forum-detail-back" onClick={onBack}>
        <IconArrowLeft className="size-4" stroke={1.8} aria-hidden="true" />
        {t('forum.detail.back')}
      </button>

      <article className="forum-panel forum-detail-article">
        <header>
          <h1>{t(post.titleKey)}</h1>
          <div className="forum-detail-byline">
            <img src={avatarUrl(post.avatarSeed)} alt="" />
            <div>
              <strong>{t(post.authorKey)}</strong>
              <span>{t('forum.detail.byline', { time: t(post.timeKey) })}</span>
            </div>
          </div>
          <div className="forum-detail-tags">
            {post.tagKeys.map((key) => <span key={key}>{t(key)}</span>)}
          </div>
        </header>

        <div className="forum-detail-body">
          <p className="forum-detail-lead">{t(post.copyKey)}</p>
          {image && <img src={image} alt={t(post.titleKey)} loading="eager" />}
          <p>{t('forum.detail.continuation')}</p>
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
          <button type="button" aria-pressed={liked} onClick={() => setLiked((current) => !current)}>
            <IconThumbUp className="size-4" stroke={1.8} aria-hidden="true" />
            <span>{t('forum.detail.like')}</span>
            <strong>{formatCount(post.likeCount + (liked ? 1 : 0))}</strong>
          </button>
          <button type="button" aria-pressed={bookmarked} onClick={() => setBookmarked((current) => !current)}>
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
          <img src={avatarUrl('arkive-current-sailor')} alt="" />
          <button type="button" onClick={onComingSoon}>{t('forum.detail.replyPlaceholder')}</button>
        </div>

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
                  onClick={() => setCommentLiked((current) => !current)}
                >
                  <IconThumbUp className="size-4" stroke={1.8} aria-hidden="true" />
                  <span>{formatCount(12 + (commentLiked ? 1 : 0))}</span>
                </button>
                <button type="button" onClick={onComingSoon}>
                  <IconMessageCircle className="size-4" stroke={1.8} aria-hidden="true" />
                  {t('forum.detail.reply')}
                </button>
              </footer>

              <div className="forum-comment-reply">
                <img src={avatarUrl(post.avatarSeed)} alt="" />
                <div>
                  <header>
                    <strong>{t(post.authorKey)}</strong>
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
        <img src={avatarUrl(post.avatarSeed)} alt="" />
        <div>
          <h2 id={headingId}>{t(post.authorKey)}</h2>
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
      <p>{t('forum.detail.authorBio', { topic: t(post.tagKeys[0]) })}</p>
      <button
        type="button"
        className={followed ? 'is-followed' : undefined}
        aria-pressed={followed}
        onClick={onToggleFollow}
      >
        {t(followed ? 'forum.users.following' : 'forum.users.follow')}
      </button>
    </section>
  )
}
