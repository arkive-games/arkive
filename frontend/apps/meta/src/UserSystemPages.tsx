import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconAt,
  IconBell,
  IconBookmark,
  IconCheck,
  IconClock,
  IconEdit,
  IconFileText,
  IconLogout,
  IconMessageCircle,
  IconPencil,
  IconSettings,
  IconShieldLock,
  IconSpeakerphone,
  IconThumbUp,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react'
import { SITES } from './sites'
import {
  avatarUrl,
  CURRENT_USER_AVATAR_SEED,
  CURRENT_USER_ID,
  findPublicProfile,
  publicProfileHref,
} from './userSystemData'
import './user-system.css'

export type NotificationSection = 'replies' | 'mentions' | 'likes' | 'system' | 'settings'
export type AccountSection = 'edit' | 'favorites' | 'posts' | 'comments' | 'fans' | 'following' | 'privacy'
export type PublicProfileSection = 'posts' | 'comments' | 'favorites' | 'fans' | 'following'

const NOTIFICATION_NAV = [
  { key: 'replies', icon: IconMessageCircle },
  { key: 'mentions', icon: IconAt },
  { key: 'likes', icon: IconThumbUp },
  { key: 'system', icon: IconSpeakerphone },
  { key: 'settings', icon: IconSettings },
] as const

const ACCOUNT_NAV = [
  { key: 'edit', icon: IconEdit },
  { key: 'favorites', icon: IconBookmark },
  { key: 'posts', icon: IconFileText },
  { key: 'comments', icon: IconMessageCircle },
  { key: 'fans', icon: IconUsers },
  { key: 'following', icon: IconUserPlus },
  { key: 'privacy', icon: IconShieldLock },
] as const

const PUBLIC_NAV = [
  { key: 'posts', icon: IconFileText },
  { key: 'comments', icon: IconMessageCircle },
  { key: 'favorites', icon: IconBookmark },
  { key: 'fans', icon: IconUsers },
  { key: 'following', icon: IconUserPlus },
] as const

const NOTIFICATION_ITEMS = {
  replies: [
    { actorKey: 'forum.users.whiteDeer.name', avatarSeed: 'arkive-white-deer', copyKey: 'reply', postKey: 'forum.posts.vrising.title', timeKey: 'forum.time.today' },
    { actorKey: 'forum.posts.aion2.author', avatarSeed: 'arkive-wind-string', copyKey: 'reply', postKey: 'forum.posts.general.title', timeKey: 'forum.time.yesterday' },
  ],
  mentions: [
    { actorKey: 'forum.posts.palworld.author', avatarSeed: 'arkive-island-builder', copyKey: 'mention', postKey: 'forum.posts.palworld.title', timeKey: 'forum.time.today' },
  ],
  likes: [
    { actorKey: 'forum.users.castleWatch.name', avatarSeed: 'arkive-castle-watch', copyKey: 'like', postKey: 'forum.posts.aion2.title', timeKey: 'forum.time.today' },
    { actorKey: 'forum.users.spireLetter.name', avatarSeed: 'arkive-spire-letter', copyKey: 'like', postKey: 'forum.posts.vrising.title', timeKey: 'forum.time.thisWeek' },
  ],
  system: [
    { actorKey: 'userSystem.notifications.systemSender', copyKey: 'system', postKey: 'userSystem.notifications.systemPost', timeKey: 'forum.time.thisWeek' },
  ],
} as const

const SETTING_GROUPS = [
  {
    key: 'interaction',
    rows: [
      { key: 'replies', icon: IconMessageCircle },
      { key: 'mentions', icon: IconAt },
      { key: 'likes', icon: IconThumbUp },
    ],
  },
  {
    key: 'platform',
    rows: [
      { key: 'follows', icon: IconUserPlus },
      { key: 'system', icon: IconSpeakerphone },
      { key: 'browser', icon: IconBell },
    ],
  },
] as const

const POST_FIXTURES = [
  { key: 'vrising', siteId: 'vrising' },
  { key: 'aion2', siteId: 'aion2' },
  { key: 'palworld', siteId: 'palworld' },
  { key: 'general', siteId: 'sts2' },
  { key: 'official', siteId: 'aion2' },
] as const

const PEOPLE = [
  { nameKey: 'forum.users.whiteDeer.name', descriptionKey: 'forum.users.whiteDeer.description', avatarSeed: 'arkive-white-deer', id: '10274831' },
  { nameKey: 'forum.users.castleWatch.name', descriptionKey: 'forum.users.castleWatch.description', avatarSeed: 'arkive-castle-watch', id: '10039267' },
  { nameKey: 'forum.users.ranchDuty.name', descriptionKey: 'forum.users.ranchDuty.description', avatarSeed: 'arkive-ranch-duty', id: '10357142' },
] as const

export function NotificationCenterPage({ section }: { section: NotificationSection }) {
  const { t } = useTranslation()
  const [enabledSettings, setEnabledSettings] = useState<Record<string, boolean>>({
    replies: true,
    mentions: true,
    likes: true,
    follows: true,
    system: true,
    browser: false,
  })
  const [readAll, setReadAll] = useState(false)

  return (
    <main className="user-system-main">
      <div className="home-shell user-system-layout">
        <UserSidebar title={t('userSystem.notifications.center')}>
          {NOTIFICATION_NAV.map(({ key, icon: Icon }) => (
            <a
              key={key}
              href={`#notifications/${key}`}
              className={section === key ? 'is-active' : undefined}
              aria-current={section === key ? 'page' : undefined}
            >
              <Icon className="size-5" stroke={1.8} aria-hidden="true" />
              <span>{t(`userSystem.notifications.${key}`)}</span>
            </a>
          ))}
        </UserSidebar>

        <section className="user-system-content" aria-labelledby="notification-page-heading">
          <PageHeading
            id="notification-page-heading"
            title={t(`userSystem.notifications.${section}`)}
            description={t(section === 'settings'
              ? 'userSystem.notifications.settingsDescription'
              : 'userSystem.notifications.inboxDescription')}
            action={section === 'settings' ? undefined : (
              <button type="button" className="text-action-button" onClick={() => setReadAll(true)}>
                <IconCheck className="size-4" stroke={1.8} aria-hidden="true" />
                {t(readAll ? 'userSystem.notifications.allRead' : 'userSystem.notifications.markAllRead')}
              </button>
            )}
          />

          {section === 'settings' ? (
            <div className="notification-settings-stack">
              {SETTING_GROUPS.map((group) => (
                <section key={group.key} className="user-panel notification-settings-group">
                  <header>
                    <h2>{t(`userSystem.notifications.settingGroups.${group.key}`)}</h2>
                  </header>
                  {group.rows.map(({ key, icon: Icon }) => (
                    <div key={key} className="notification-setting-row">
                      <span className="setting-icon"><Icon className="size-5" stroke={1.8} /></span>
                      <span className="setting-copy">
                        <strong>{t(`userSystem.notifications.settingsRows.${key}.title`)}</strong>
                        <small>{t(`userSystem.notifications.settingsRows.${key}.description`)}</small>
                      </span>
                      <SwitchControl
                        checked={enabledSettings[key]}
                        label={t(`userSystem.notifications.settingsRows.${key}.title`)}
                        onChange={() => setEnabledSettings((current) => ({ ...current, [key]: !current[key] }))}
                      />
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <NotificationInbox section={section} readAll={readAll} />
          )}
        </section>
      </div>
    </main>
  )
}

function NotificationInbox({ section, readAll }: { section: Exclude<NotificationSection, 'settings'>; readAll: boolean }) {
  const { t } = useTranslation()
  const items = NOTIFICATION_ITEMS[section]

  return (
    <div className="user-panel notification-list">
      {items.map((item, index) => (
        <article key={`${item.copyKey}-${index}`} className={readAll ? 'is-read' : undefined}>
          {'avatarSeed' in item ? (
            <img src={avatarUrl(item.avatarSeed)} alt="" />
          ) : (
            <span className="notification-system-icon"><SpeakerIcon /></span>
          )}
          <div>
            <p>
              <strong>{t(item.actorKey)}</strong>
              {' '}
              {t(`userSystem.notifications.items.${item.copyKey}`, { post: t(item.postKey) })}
            </p>
            <time><IconClock className="size-4" stroke={1.8} />{t(item.timeKey)}</time>
          </div>
          {!readAll && <span className="unread-label">{t('userSystem.notifications.unread')}</span>}
        </article>
      ))}
    </div>
  )
}

export function AccountCenterPage({
  section,
  onLogout,
}: {
  section: AccountSection
  onLogout: () => void
}) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState(() => ({
    name: t('userSystem.currentUser.name'),
    bio: t('userSystem.currentUser.bio'),
  }))
  const [saved, setSaved] = useState(false)

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setProfile({
      name: String(data.get('displayName') ?? profile.name),
      bio: String(data.get('bio') ?? profile.bio),
    })
    setSaved(true)
  }

  return (
    <main className="user-system-main account-center-main">
      <div className="home-shell">
        <ProfileSummary
          userId={CURRENT_USER_ID}
          name={profile.name}
          bio={profile.bio}
          avatarSeed={CURRENT_USER_AVATAR_SEED}
          ownProfile
        />
        <div className="user-system-layout account-layout">
          <UserSidebar title={t('userSystem.account.center')}>
            {ACCOUNT_NAV.map(({ key, icon: Icon }) => (
              <a
                key={key}
                href={`#account/${key}`}
                className={section === key ? 'is-active' : undefined}
                aria-current={section === key ? 'page' : undefined}
              >
                <Icon className="size-5" stroke={1.8} aria-hidden="true" />
                <span>{t(`userSystem.account.${key}`)}</span>
              </a>
            ))}
            <button type="button" className="logout-navigation" onClick={onLogout}>
              <IconLogout className="size-5" stroke={1.8} aria-hidden="true" />
              <span>{t('userSystem.account.logout')}</span>
            </button>
          </UserSidebar>

          <section className="user-system-content" aria-labelledby="account-page-heading">
            <PageHeading
              id="account-page-heading"
              title={t(`userSystem.account.${section}`)}
              description={t(`userSystem.account.descriptions.${section}`)}
            />
            <AccountContent
              section={section}
              profile={profile}
              saved={saved}
              onSave={saveProfile}
              onEdit={() => setSaved(false)}
            />
          </section>
        </div>
      </div>
    </main>
  )
}

function AccountContent({
  section,
  profile,
  saved,
  onSave,
  onEdit,
}: {
  section: AccountSection
  profile: { name: string; bio: string }
  saved: boolean
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onEdit: () => void
}) {
  const { t } = useTranslation()

  if (section === 'edit') {
    return (
      <form className="user-panel profile-edit-form" onSubmit={onSave} onChange={onEdit}>
        <div className="profile-avatar-editor">
          <img src={avatarUrl(CURRENT_USER_AVATAR_SEED, 160)} alt="" />
          <button type="button">
            <IconPencil className="size-4" stroke={1.8} />
            {t('userSystem.account.changeAvatar')}
          </button>
        </div>
        <FormField label={t('userSystem.account.fields.displayName')}>
          <input name="displayName" defaultValue={profile.name} maxLength={20} />
        </FormField>
        <FormField label={t('userSystem.account.fields.accountId')} helper={t('userSystem.account.fields.accountIdHelper')}>
          <input value={CURRENT_USER_ID} readOnly />
        </FormField>
        <FormField label={t('userSystem.account.fields.bio')}>
          <textarea name="bio" defaultValue={profile.bio} maxLength={120} rows={4} />
        </FormField>
        <div className="profile-form-footer">
          {saved && <span role="status"><IconCheck className="size-4" stroke={1.8} />{t('userSystem.account.saved')}</span>}
          <button type="submit" className="primary-action">{t('userSystem.account.save')}</button>
        </div>
      </form>
    )
  }

  if (section === 'comments') return <CommentHistory />
  if (section === 'fans' || section === 'following') return <PeopleList mode={section} />
  if (section === 'privacy') return <PrivacySettings />
  return <ProfilePostList mode={section} />
}

export function PublicUserProfilePage({
  userId,
  section,
}: {
  userId: string
  section: PublicProfileSection
}) {
  const { t } = useTranslation()
  const profile = findPublicProfile(userId)
  const [followed, setFollowed] = useState(false)

  return (
    <main className="user-system-main public-profile-main">
      <div className="home-shell">
        <ProfileSummary
          userId={userId}
          name={t(profile.nameKey)}
          bio={t(profile.bioKey)}
          avatarSeed={profile.avatarSeed}
          followerCount={profile.followerCount}
          followingCount={profile.followingCount}
          likeCount={profile.likeCount}
          action={(
            <button
              type="button"
              className={followed ? 'profile-follow-action is-followed' : 'profile-follow-action'}
              aria-pressed={followed}
              onClick={() => setFollowed((current) => !current)}
            >
              {t(followed ? 'forum.users.following' : 'forum.users.follow')}
            </button>
          )}
        />
        <div className="user-system-layout account-layout">
          <UserSidebar title={t('userSystem.publicProfile.center')}>
            {PUBLIC_NAV.map(({ key, icon: Icon }) => (
              <a
                key={key}
                href={publicProfileHref(userId, key)}
                className={section === key ? 'is-active' : undefined}
                aria-current={section === key ? 'page' : undefined}
              >
                <Icon className="size-5" stroke={1.8} aria-hidden="true" />
                <span>{t(`userSystem.publicProfile.${key}`)}</span>
              </a>
            ))}
          </UserSidebar>
          <section className="user-system-content" aria-labelledby="public-profile-heading">
            <PageHeading
              id="public-profile-heading"
              title={t(`userSystem.publicProfile.${section}`)}
              description={t(`userSystem.publicProfile.descriptions.${section}`)}
            />
            {section === 'posts' ? (
              <ProfilePostList mode="posts" postKeys={profile.featuredPostKeys} />
            ) : section === 'comments' ? (
              <CommentHistory publicProfile />
            ) : section === 'fans' || section === 'following' ? (
              <PeopleList mode={section} />
            ) : (
              <ProfilePostList mode="favorites" postKeys={['official']} />
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function ProfileSummary({
  userId,
  name,
  bio,
  avatarSeed,
  followerCount = 12,
  followingCount = 27,
  likeCount = 136,
  ownProfile = false,
  action,
}: {
  userId: string
  name: string
  bio: string
  avatarSeed: string
  followerCount?: number
  followingCount?: number
  likeCount?: number
  ownProfile?: boolean
  action?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const formatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  )

  return (
    <section className="profile-summary user-panel">
      <div className="profile-summary-accent" aria-hidden="true" />
      <img className="profile-summary-avatar" src={avatarUrl(avatarSeed, 192)} alt="" />
      <div className="profile-summary-copy">
        <div className="profile-summary-name-row">
          <h1>{name}</h1>
          {ownProfile && <span>{t('userSystem.currentUser.badge')}</span>}
        </div>
        <p className="profile-account-id">{t('userSystem.publicProfile.accountId', { id: userId })}</p>
        <p className="profile-bio">{bio}</p>
        <dl>
          <div><dd>{formatter.format(followerCount)}</dd><dt>{t('userSystem.publicProfile.fans')}</dt></div>
          <div><dd>{formatter.format(followingCount)}</dd><dt>{t('userSystem.publicProfile.following')}</dt></div>
          <div><dd>{formatter.format(likeCount)}</dd><dt>{t('userSystem.publicProfile.likesReceived')}</dt></div>
        </dl>
      </div>
      {action && <div className="profile-summary-action">{action}</div>}
    </section>
  )
}

function ProfilePostList({
  mode,
  postKeys,
}: {
  mode: 'favorites' | 'posts'
  postKeys?: readonly string[]
}) {
  const { t } = useTranslation()
  const keys = postKeys ?? (mode === 'favorites' ? ['vrising', 'aion2'] : ['general', 'palworld'])

  return (
    <div className="profile-post-list">
      {keys.map((key) => {
        const fixture = POST_FIXTURES.find((item) => item.key === key) ?? POST_FIXTURES[0]
        const site = SITES.find((item) => item.id === fixture.siteId) ?? SITES[0]
        return (
          <article key={key} className="user-panel profile-post-card">
            <div className="profile-post-copy">
              <time>{t('forum.time.thisWeek')}</time>
              <h2>{t(`forum.posts.${fixture.key}.title`)}</h2>
              <p>{t(`forum.posts.${fixture.key}.copy`)}</p>
              <footer>
                <span><IconMessageCircle className="size-4" stroke={1.8} />{t('userSystem.content.commentsCount', { count: 1 })}</span>
                <span><IconThumbUp className="size-4" stroke={1.8} />{t('userSystem.content.likesCount', { count: 23 })}</span>
              </footer>
            </div>
            <img src={site.bg} alt={t(`forum.posts.${fixture.key}.title`)} />
          </article>
        )
      })}
    </div>
  )
}

function CommentHistory({ publicProfile = false }: { publicProfile?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="user-panel comment-history">
      {[0, 1].map((index) => (
        <article key={index}>
          <img src={avatarUrl(publicProfile ? 'arkive-dusk-raven' : CURRENT_USER_AVATAR_SEED)} alt="" />
          <div>
            <header>
              <strong>{publicProfile ? t('forum.posts.vrising.author') : t('userSystem.currentUser.name')}</strong>
              <time>{t(index === 0 ? 'forum.time.today' : 'forum.time.yesterday')}</time>
            </header>
            <p>{t(`userSystem.content.comment${index + 1}`)}</p>
            <a href="#forum">{t('userSystem.content.viewDiscussion')}</a>
          </div>
        </article>
      ))}
    </div>
  )
}

function PeopleList({ mode }: { mode: 'fans' | 'following' }) {
  const { t } = useTranslation()
  const [followed, setFollowed] = useState<Set<string>>(
    () => new Set(mode === 'following' ? PEOPLE.map((person) => person.id) : []),
  )

  const toggle = (id: string) => {
    setFollowed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="user-panel people-list">
      {PEOPLE.map((person) => {
        const isFollowed = followed.has(person.id)
        return (
          <article key={person.id}>
            <a href={publicProfileHref(person.id)}><img src={avatarUrl(person.avatarSeed)} alt="" /></a>
            <span>
              <a href={publicProfileHref(person.id)}>{t(person.nameKey)}</a>
              <small>{t(person.descriptionKey)}</small>
            </span>
            <button type="button" className={isFollowed ? 'is-followed' : undefined} onClick={() => toggle(person.id)}>
              {t(isFollowed ? 'forum.users.following' : 'forum.users.follow')}
            </button>
          </article>
        )
      })}
    </div>
  )
}

function PrivacySettings() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState({ profile: true, posts: true, activity: false })

  return (
    <div className="user-panel privacy-settings">
      {Object.entries(settings).map(([key, checked]) => (
        <div key={key}>
          <span>
            <strong>{t(`userSystem.privacy.${key}.title`)}</strong>
            <small>{t(`userSystem.privacy.${key}.description`)}</small>
          </span>
          <SwitchControl
            checked={checked}
            label={t(`userSystem.privacy.${key}.title`)}
            onChange={() => setSettings((current) => ({ ...current, [key]: !current[key as keyof typeof current] }))}
          />
        </div>
      ))}
    </div>
  )
}

function UserSidebar({ title, children }: { title: string; children: ReactNode }) {
  return (
    <aside className="user-panel user-system-sidebar">
      <h2>{title}</h2>
      <nav>{children}</nav>
    </aside>
  )
}

function PageHeading({
  id,
  title,
  description,
  action,
}: {
  id: string
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <header className="user-page-heading">
      <div>
        <h1 id={id}>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  )
}

function FormField({
  label,
  helper,
  children,
}: {
  label: string
  helper?: string
  children: ReactNode
}) {
  return (
    <label className="profile-form-field">
      <span>{label}</span>
      {children}
      {helper && <small>{helper}</small>}
    </label>
  )
}

function SwitchControl({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch-control"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span />
    </button>
  )
}

function SpeakerIcon() {
  return <IconSpeakerphone className="size-5" stroke={1.8} aria-hidden="true" />
}
