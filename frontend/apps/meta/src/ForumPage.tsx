import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconAdjustmentsHorizontal,
  IconChevronDown,
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

export function ForumPage({ sites, onComingSoon }: ForumPageProps) {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<ForumChannel>('hot')
  const [feedTab, setFeedTab] = useState<FeedTab>('recommended')
  const [gameFilter, setGameFilter] = useState<string | null>(null)
  const [gamesExpanded, setGamesExpanded] = useState(true)
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
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

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmittedQuery(query)
  }

  const selectChannel = (nextChannel: ForumChannel) => {
    setChannel(nextChannel)
    if (nextChannel !== 'games') setGameFilter(null)
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

          <section className="forum-feed-section" aria-labelledby="forum-feed-heading">
            <div className="forum-section-heading">
              <h2 id="forum-feed-heading">{t('forum.feed.title')}</h2>
            </div>
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
                      onClick={() => setFeedTab(tab)}
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
                <div className="forum-post-list">
                  {visiblePosts.map((post) => (
                    <ForumPostCard
                      key={post.id}
                      post={post}
                      image={post.gameId ? siteById.get(post.gameId)?.bg : undefined}
                      onComingSoon={onComingSoon}
                    />
                  ))}
                </div>
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
                    }}
                  >
                    {t('forum.empty.action')}
                  </button>
                </div>
              )}
            </div>
          </section>
        </section>

        <aside className="forum-right-rail" aria-label={t('forum.sidebar.label')}>
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
  onComingSoon,
}: {
  post: ForumPost
  image?: string
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
        </div>
        <h3>{t(post.titleKey)}</h3>
        <p>{t(post.copyKey)}</p>
        <div className="forum-post-tags">
          {post.tagKeys.map((key) => <span key={key}>{t(key)}</span>)}
        </div>
        {image && <img className="forum-post-media" src={image} alt={t(post.titleKey)} loading="lazy" />}
      </div>
      <div className="forum-post-actions">
        <button type="button" aria-label={t('forum.actions.comment')} onClick={onComingSoon}>
          <IconMessageCircle className="size-4" stroke={1.8} />
        </button>
        <button type="button" aria-label={t('forum.actions.like')} onClick={onComingSoon}>
          <IconThumbUp className="size-4" stroke={1.8} />
        </button>
      </div>
    </article>
  )
}
