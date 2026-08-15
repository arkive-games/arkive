import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, useAuth } from '@gamemap/auth'
import {
  followUser,
  listFollowers,
  listFollowing,
  getFollowCounts,
  getUserByUid,
  listForumPosts,
  listNotifications,
  result,
  unfollowUser,
  type ApiClient,
  type FollowRead,
  type PostRead,
  type Read as NotificationRead,
  type UserPublic,
} from '@gamemap/api-core'
import { calendarDate } from './forumModel'
import { browserMemory, defineMemoryRecord, memoryPolicy } from '@gamemap/state-memory'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
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
  IconMinus,
  IconPencil,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconShieldLock,
  IconSpeakerphone,
  IconThumbUp,
  IconUpload,
  IconUserPlus,
  IconUsers,
  IconX,
} from '@tabler/icons-react'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  POPUP_CLOSE_CONTROL_CLASS,
} from '@gamemap/ui'
import { SITES, siteHref } from './sites'
import { AVATAR_PRESETS, DEFAULT_AVATAR_SRC } from './avatarPresets'
import { avatarUrl, publicProfileHref } from './userSystemData'
import {
  useUserSystem,
  type NotificationPreferenceKey,
  type PrivacyPreferenceKey,
} from './UserSystemState'
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



export function NotificationCenterPage({ section }: { section: NotificationSection }) {
  const { t } = useTranslation()
  const auth = useAuth()
  // The client the session already uses, so the inbox cannot disagree with the
  // account control about the transport. Null when no API is configured.
  const client = auth.enabled ? auth.client.requestClient : null
  const {
    state,
    markNotificationSectionRead,
    toggleNotificationSetting,
  } = useUserSystem()
  const inboxSection = section === 'settings' ? null : section
  const readAll = inboxSection ? state.readNotificationSections.includes(inboxSection) : false

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
              <button
                type="button"
                className="text-action-button"
                disabled={readAll}
                onClick={() => inboxSection && markNotificationSectionRead(inboxSection)}
              >
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
                        checked={state.notificationSettings[key]}
                        label={t(`userSystem.notifications.settingsRows.${key}.title`)}
                        onChange={() => toggleNotificationSetting(key as NotificationPreferenceKey)}
                      />
                    </div>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <NotificationInbox section={section} readAll={readAll} client={client} />
          )}
        </section>
      </div>
    </main>
  )
}

/**
 * Which notification kinds each inbox tab shows.
 *
 * The tabs predate the API and group its six kinds into four: a like is a like
 * whether it landed on a post or a comment, which is the distinction the server
 * keeps and the reader does not care about.
 */
type NotificationKind = 'reply' | 'mention' | 'post_like' | 'comment_like' | 'follow' | 'system'

const NOTIFICATION_KINDS: Record<Exclude<NotificationSection, 'settings'>, readonly NotificationKind[]> = {
  replies: ['reply'],
  mentions: ['mention'],
  likes: ['post_like', 'comment_like'],
  // `follow` sits here rather than in a tab of its own, matching where the
  // notification settings already group it — under "follows and platform". It
  // appeared in no list at all before, so a new-follower notification was fetched
  // and then dropped on every tab: invisible, with nothing to say it existed.
  system: ['system', 'follow'],
}

/**
 * Which copy template a kind uses.
 *
 * Keyed by `NotificationKind` rather than `string`, deliberately. As a
 * `Record<string, …>` the index signature swallowed every key, so adding `follow`
 * to a tab without giving it a sentence compiled cleanly — and it fell through to
 * the reply template, announcing a new follower as *"Alice replied to your comment
 * on 'a deleted post'"*. A follow carries neither a post nor a body (the schema
 * says so: "a follow is about neither"), so both interpolation sources were null
 * and the row invented a comment and a post that had never existed. Typed this
 * way, the next kind added fails to compile until someone decides what it says.
 */
const NOTIFICATION_COPY: Record<NotificationKind, 'reply' | 'mention' | 'like' | 'system' | 'follow'> = {
  reply: 'reply',
  mention: 'mention',
  post_like: 'like',
  comment_like: 'like',
  follow: 'follow',
  system: 'system',
}

/**
 * The notifications inbox.
 *
 * Five invented rows before this — "White Deer Field replied to your …" with a
 * pravatar portrait and a relative time that was a locale string reading "2 hours
 * ago" forever. The rows are real now. Each carries its actor's name and avatar
 * and the title of the post it is about, so the list renders from one request
 * rather than a profile lookup per row.
 */
function NotificationInbox({
  section,
  readAll,
  client,
}: {
  section: Exclude<NotificationSection, 'settings'>
  readAll: boolean
  client: ApiClient['client'] | null
}) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<NotificationRead[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!client) {
      setRows([])
      return
    }
    let active = true
    setLoading(true)
    setFailed(false)
    void result(listNotifications({
      client,
      throwOnError: true,
      // The tab's kinds, so a page holds that tab. Filtering one page of fifty in
      // the browser meant a reader with fifty recent likes saw an empty replies
      // tab while replies existed.
      query: { kind: [...NOTIFICATION_KINDS[section]], page: 1, pageSize: 50 },
    }))
      .then((page) => {
        if (!active) return
        setRows(page.results ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setRows([])
        setFailed(true)
        setLoading(false)
      })
    return () => { active = false }
  }, [client, section])

  const items = rows

  if (loading) {
    return <div className="user-panel notification-list"><p className="forum-feed-status" role="status">{t('forum.loading')}</p></div>
  }
  if (failed) {
    return <div className="user-panel notification-list"><p className="forum-feed-status is-error" role="alert">{t('forum.errors.feed')}</p></div>
  }
  if (items.length === 0) {
    return (
      <div className="user-panel notification-list">
        <p className="forum-comment-empty">{t('userSystem.notifications.empty')}</p>
      </div>
    )
  }

  return (
    <div className="user-panel notification-list">
      {items.map((item) => {
        // `readAll` is the "mark all read" button's local state; a row also knows
        // whether it was already read when it arrived.
        const read = readAll || item.readAt !== null
        return (
          <article key={item.id} className={read ? 'is-read' : undefined}>
            {item.actorAvatarUrl ? (
              <img src={item.actorAvatarUrl} alt="" />
            ) : (
              <span className="notification-system-icon"><SpeakerIcon /></span>
            )}
            <div>
              <p>
                <strong>{item.actorName ?? t('userSystem.notifications.systemSender')}</strong>
                {' '}
                {/* A follow has no subject at all, so its sentence takes no
                    interpolation — passing one would have been how the "deleted
                    post" fallback crept in. Every other kind is about a post,
                    except a system message, whose text is its body. */}
                {NOTIFICATION_COPY[item.kind] === 'follow'
                  ? t('userSystem.notifications.items.follow')
                  : t(`userSystem.notifications.items.${NOTIFICATION_COPY[item.kind]}`, {
                      post: item.postTitle ?? item.body ?? t('userSystem.notifications.deletedPost'),
                    })}
              </p>
              <time dateTime={item.createdAt}>
                <IconClock className="size-4" stroke={1.8} />
                {calendarDate(item.createdAt)}
              </time>
            </div>
            {!read && <span className="unread-label">{t('userSystem.notifications.unread')}</span>}
          </article>
        )
      })}
    </div>
  )
}

export function AccountCenterPage({
  section,
  onLogout,
  onAuthRequired,
}: {
  section: AccountSection
  onLogout: () => void
  onAuthRequired: () => void
}) {
  const { t } = useTranslation()
  const auth = useAuth()
  const { state, updateLocalProfile } = useUserSystem()
  const user = auth.user
  /**
   * The reader's own follower and following totals.
   *
   * Previously 0 and the length of a localStorage array, which is what one
   * browser happened to remember rather than what the site records.
   */
  const ownClient = auth.enabled ? auth.client.requestClient : null
  // `uid`, not `id`. `user.id` is the account UUID, so parsing it yielded NaN and
  // this effect never ran — the account centre's follower and following numbers
  // sat at zero for everyone.
  const ownUidValue = user?.uid ?? null
  const [ownFollowCounts, setOwnFollowCounts] = useState({ followers: 0, following: 0 })
  useEffect(() => {
    if (!ownClient || ownUidValue === null) return
    let active = true
    void result(getFollowCounts({ client: ownClient, throwOnError: true, path: { uid: ownUidValue } }))
      .then((counts) => {
        if (!active) return
        setOwnFollowCounts({ followers: counts.followerCount ?? 0, following: counts.followingCount ?? 0 })
      })
      .catch(() => {})
    return () => { active = false }
  }, [ownClient, ownUidValue])
  const profileDraftRecord = useMemo(() => defineMemoryRecord({
    id: 'profile', namespace: 'site', surface: 'account-editor',
    ...memoryPolicy.taskDraft('discard-profile-draft'),
    schemaVersion: '1.0.0',
    defaultValue: () => ({
      name: user?.name ?? '',
      bio: state.profile.bio,
    }),
    validate: (value: unknown): value is { name: string; bio: string } => {
      if (!value || typeof value !== 'object') return false
      const draft = value as Record<string, unknown>
      return typeof draft.name === 'string' && draft.name.length <= 64
        && typeof draft.bio === 'string' && draft.bio.length <= 120
    },
    partition: { account: true },
    signInAdoption: 'keep_anonymous',
  }), [state.profile.bio, user?.name])
  const [profile, setProfile] = useState(() => user
    ? {
        ...browserMemory.read(profileDraftRecord, { accountId: user.id }),
        email: user.email,
      }
    : ({
    name: '',
    email: '',
    bio: state.profile.bio,
    }))
  const skipNextDraftWrite = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!user) return
    setProfile({
      ...browserMemory.read(profileDraftRecord, { accountId: user.id }),
      email: user.email,
    })
  }, [profileDraftRecord, user])

  useEffect(() => {
    if (!user) return
    if (skipNextDraftWrite.current) {
      skipNextDraftWrite.current = false
      return
    }
    const timeout = window.setTimeout(() => {
      browserMemory.write(profileDraftRecord, {
        name: profile.name,
        bio: profile.bio,
      }, { accountId: user.id })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [profile, profileDraftRecord, user])

  if (!user) return null

  const avatarSrc = state.profile.avatarSrc ?? DEFAULT_AVATAR_SRC
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const nextProfile = {
      name: String(data.get('displayName') ?? profile.name).trim(),
      email: String(data.get('email') ?? profile.email).trim(),
      bio: String(data.get('bio') ?? profile.bio).trim(),
    }
    const password = String(data.get('password') ?? '')
    setSaveStatus('saving')
    setSaveError('')
    try {
      const remoteUpdate: { name?: string; email?: string; password?: string } = {}
      if (nextProfile.name !== user.name) remoteUpdate.name = nextProfile.name
      if (nextProfile.email !== user.email) remoteUpdate.email = nextProfile.email
      if (password) remoteUpdate.password = password
      if (Object.keys(remoteUpdate).length > 0) {
        await auth.client.updateCurrentUser(remoteUpdate)
        await auth.refresh()
      }
      updateLocalProfile({ bio: nextProfile.bio })
      skipNextDraftWrite.current = true
      browserMemory.clear(profileDraftRecord, { accountId: user.id })
      setProfile(nextProfile)
      form.reset()
      setSaveStatus('saved')
    } catch (caught) {
      const message = caught instanceof AuthError && caught.code === 'UserEmailAlreadyExistsError'
        ? t('userSystem.account.errors.emailExists')
        : t('userSystem.account.errors.saveFailed')
      setSaveError(message)
      setSaveStatus('error')
    }
  }

  return (
    <main className="user-system-main account-center-main">
      <div className="home-shell">
        <ProfileSummary
          userId={String(user.uid)}
          name={profile.name}
          bio={profile.bio || t('userSystem.account.emptyBio')}
          avatarSeed={user.id}
          avatarSrc={avatarSrc}
          followerCount={ownFollowCounts.followers}
          followingCount={ownFollowCounts.following}
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
              onAuthRequired={onAuthRequired}
              section={section}
              profile={profile}
              userId={String(user.uid)}
              uid={user.uid}
              verified={user.isVerified}
              avatarSrc={avatarSrc}
              saveStatus={saveStatus}
              saveError={saveError}
              onSave={saveProfile}
              onEdit={() => {
                setSaveStatus('idle')
                setSaveError('')
              }}
              onProfileChange={(field, value) => {
                setSaveStatus('idle')
                setSaveError('')
                setProfile((current) => ({ ...current, [field]: value }))
              }}
              onAvatarChange={(src) => updateLocalProfile({ avatarSrc: src })}
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
  userId,
  uid,
  verified,
  avatarSrc,
  saveStatus,
  saveError,
  onSave,
  onEdit,
  onProfileChange,
  onAvatarChange,
  onAuthRequired,
}: {
  section: AccountSection
  profile: { name: string; email: string; bio: string }
  /**
   * The account number as a string, for display. Not the UUID: a reader
   * identifies by the short number, and the edit form field labelled
   * "account ID" was showing them a uuid nobody can quote.
   */
  userId: string
  /** The permanent account number, which every list here keys by. */
  uid: number | null
  verified: boolean
  avatarSrc: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveError: string
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onEdit: () => void
  onProfileChange: (field: 'name' | 'email' | 'bio', value: string) => void
  onAvatarChange: (src: string) => void
  onAuthRequired: () => void
}) {
  const { t } = useTranslation()
  const accountAuth = useAuth()
  const accountClient = accountAuth.enabled ? accountAuth.client.requestClient : null
  // Passed in rather than derived from `userId`, which is the account UUID: every
  // list on these pages keys by the numeric uid, and parsing the UUID gave NaN —
  // so `#account/posts` showed "no posts yet" to an account that had posts, and
  // the follower and following lists were empty for everyone.
  const ownUid = uid

  if (section === 'edit') {
    return (
      <form className="user-panel profile-edit-form" onSubmit={(event) => void onSave(event)} onChange={onEdit}>
        <div className="profile-avatar-editor">
          <img src={avatarSrc} alt="" />
          <AvatarUploadDialog currentSrc={avatarSrc} onChange={onAvatarChange} />
        </div>
        <FormField label={t('userSystem.account.fields.displayName')}>
          <input
            name="displayName"
            value={profile.name}
            onChange={(event) => onProfileChange('name', event.target.value)}
            maxLength={64}
            required
            autoComplete="nickname"
          />
        </FormField>
        {/* Read-only, and refused server-side as well.

            Nothing here proves a new address belongs to the person asking: the
            change would take effect at once, and the address is where a password
            reset is sent — so a session borrowed for a minute could redirect
            account recovery permanently. The way back is a change-of-address flow
            that mails a token to the new account; until that exists an
            administrator does it. */}
        <FormField label={t('userSystem.account.fields.email')} helper={t('userSystem.account.fields.emailHelper')}>
          <input name="email" type="email" value={profile.email} readOnly autoComplete="email" />
        </FormField>
        <FormField label={t('userSystem.account.fields.accountId')} helper={t('userSystem.account.fields.accountIdHelper')}>
          <input value={userId} readOnly />
        </FormField>
        <FormField label={t('userSystem.account.fields.bio')}>
          <textarea
            name="bio"
            value={profile.bio}
            onChange={(event) => onProfileChange('bio', event.target.value)}
            maxLength={120}
            rows={4}
          />
        </FormField>
        <FormField
          label={t('userSystem.account.fields.password')}
          helper={t(verified
            ? 'userSystem.account.fields.verifiedHelper'
            : 'userSystem.account.fields.unverifiedHelper')}
        >
          <input
            name="password"
            type="password"
            minLength={8}
            maxLength={1024}
            autoComplete="new-password"
            placeholder={t('userSystem.account.fields.passwordPlaceholder')}
          />
        </FormField>
        <div className="profile-form-footer">
          {saveStatus === 'saved' && <span role="status"><IconCheck className="size-4" stroke={1.8} />{t('userSystem.account.saved')}</span>}
          {saveStatus === 'error' && <span className="profile-save-error" role="alert">{saveError}</span>}
          <button type="submit" className="primary-action" disabled={saveStatus === 'saving'}>
            {t(saveStatus === 'saving' ? 'userSystem.account.saving' : 'userSystem.account.save')}
          </button>
        </div>
      </form>
    )
  }

  if (section === 'favorites') return <FavoriteContent client={accountClient} />
  if (section === 'comments') return <EmptyAccountContent kind="comments" />
  if (section === 'posts') return <ProfilePostList uid={ownUid} client={accountClient} />
  if (section === 'fans') return <PeopleList mode="fans" uid={ownUid} client={accountClient} onAuthRequired={onAuthRequired} ownProfile />
  if (section === 'following') return <PeopleList mode="following" uid={ownUid} client={accountClient} onAuthRequired={onAuthRequired} ownProfile />
  if (section === 'privacy') return <PrivacySettings />
  return null
}

const AVATAR_OUTPUT_SIZE = 512
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const AVATAR_MIN_ZOOM = 1
const AVATAR_MAX_ZOOM = 3

function AvatarUploadDialog({
  currentSrc,
  onChange,
}: {
  currentSrc: string
  onChange: (src: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [selectedSrc, setSelectedSrc] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(AVATAR_MIN_ZOOM)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) {
      setSelectedSrc(null)
      setFileName('')
      setCrop({ x: 0, y: 0 })
      setZoom(AVATAR_MIN_ZOOM)
      setCroppedAreaPixels(null)
      setProcessing(false)
      setError('')
    }
  }

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    setError('')
    setFileName('')
    setSelectedSrc(null)
    if (!AVATAR_TYPES.has(file.type)) {
      setError(t('userSystem.account.avatarDialog.errors.type'))
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError(t('userSystem.account.avatarDialog.errors.size'))
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      await loadImage(dataUrl)
      setSelectedSrc(dataUrl)
      setFileName(file.name)
      setCrop({ x: 0, y: 0 })
      setZoom(AVATAR_MIN_ZOOM)
      setCroppedAreaPixels(null)
    } catch {
      setError(t('userSystem.account.avatarDialog.errors.read'))
    }
  }

  const applyAvatar = async () => {
    if (!selectedSrc || !croppedAreaPixels || processing) return
    setProcessing(true)
    setError('')
    try {
      const avatar = await createSquareAvatar(selectedSrc, croppedAreaPixels)
      onChange(avatar)
      setOpen(false)
    } catch {
      setError(t('userSystem.account.avatarDialog.errors.read'))
    } finally {
      setProcessing(false)
    }
  }

  const adjustZoom = (amount: number) => {
    setZoom((current) => Math.min(AVATAR_MAX_ZOOM, Math.max(AVATAR_MIN_ZOOM, current + amount)))
  }

  const resetCrop = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(AVATAR_MIN_ZOOM)
  }

  const selectPreset = (src: string) => {
    onChange(src)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <button type="button">
          <IconPencil className="size-4" stroke={1.8} />
          {t('userSystem.account.changeAvatar')}
        </button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[var(--arkive-layer-sheet-backdrop)]"
        className="z-[var(--arkive-layer-sheet)] max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0"
      >
        <div className="relative border-b border-border bg-background px-6 py-5">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`absolute right-3 top-3 ${POPUP_CLOSE_CONTROL_CLASS}`}
              aria-label={t('userSystem.account.avatarDialog.close')}
            >
              <IconX className="size-4" stroke={1.8} />
            </Button>
          </DialogClose>
          <DialogHeader className="pr-9 text-left">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <IconPhoto className="size-5" stroke={1.8} aria-hidden="true" />
              </span>
              <DialogTitle>
                {t('userSystem.account.avatarDialog.title')}
              </DialogTitle>
            </div>
            <DialogDescription className="max-w-md leading-relaxed">
              {t('userSystem.account.avatarDialog.description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-6">
          {selectedSrc ? (
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-start">
              <div className="avatar-crop-stage">
                <Cropper
                  image={selectedSrc}
                  crop={crop}
                  zoom={zoom}
                  minZoom={AVATAR_MIN_ZOOM}
                  maxZoom={AVATAR_MAX_ZOOM}
                  aspect={1}
                  cropShape="rect"
                  objectFit="cover"
                  showGrid
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, area) => setCroppedAreaPixels(area)}
                  classes={{
                    containerClassName: 'avatar-cropper',
                    cropAreaClassName: 'avatar-cropper-area',
                  }}
                  cropperProps={{
                    'aria-label': t('userSystem.account.avatarDialog.editor'),
                  }}
                />
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                    <span>{t('userSystem.account.avatarDialog.zoom')}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
                  </div>
                  <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-lg"
                      onClick={() => adjustZoom(-0.1)}
                      disabled={zoom <= AVATAR_MIN_ZOOM}
                      aria-label={t('userSystem.account.avatarDialog.zoomOut')}
                      title={t('userSystem.account.avatarDialog.zoomOut')}
                    >
                      <IconMinus className="size-4" stroke={1.8} />
                    </Button>
                    <input
                      type="range"
                      min={AVATAR_MIN_ZOOM}
                      max={AVATAR_MAX_ZOOM}
                      step="0.01"
                      value={zoom}
                      onChange={(event) => setZoom(Number(event.target.value))}
                      className="w-full cursor-pointer accent-primary"
                      aria-label={t('userSystem.account.avatarDialog.zoom')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="rounded-lg"
                      onClick={() => adjustZoom(0.1)}
                      disabled={zoom >= AVATAR_MAX_ZOOM}
                      aria-label={t('userSystem.account.avatarDialog.zoomIn')}
                      title={t('userSystem.account.avatarDialog.zoomIn')}
                    >
                      <IconPlus className="size-4" stroke={1.8} />
                    </Button>
                  </div>
                </div>

                <Button type="button" variant="outline" className="w-full rounded-lg" onClick={resetCrop}>
                  <IconRefresh className="size-4" stroke={1.8} />
                  {t('userSystem.account.avatarDialog.reset')}
                </Button>

                <div className="space-y-2">
                  <p className="truncate text-xs text-muted-foreground" title={fileName}>{fileName}</p>
                  <label
                    className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring"
                  >
                    <IconUpload className="size-5 text-primary" stroke={1.8} aria-hidden="true" />
                    {t('userSystem.account.avatarDialog.replace')}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      className="sr-only"
                      onChange={(event) => void selectFile(event)}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <section aria-labelledby="avatar-preset-title">
                <h3 id="avatar-preset-title" className="mb-3 text-sm font-bold">
                  {t('userSystem.account.avatarDialog.presets')}
                </h3>
                <div className="avatar-preset-grid">
                  {AVATAR_PRESETS.map((preset, index) => {
                    const selected = currentSrc === preset.src
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className="avatar-preset-button"
                        aria-pressed={selected}
                        aria-label={t('userSystem.account.avatarDialog.presetLabel', { number: index + 1 })}
                        onClick={() => selectPreset(preset.src)}
                      >
                        <img src={preset.src} alt="" />
                        {selected && (
                          <span className="avatar-preset-check" aria-hidden="true">
                            <IconCheck className="size-4" stroke={2.2} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="avatar-custom-upload" aria-labelledby="avatar-upload-title">
                <div>
                  <h3 id="avatar-upload-title" className="text-sm font-bold">
                    {t('userSystem.account.avatarDialog.custom')}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t('userSystem.account.avatarDialog.requirements')}
                  </p>
                </div>
                <label
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring"
                >
                  <IconUpload className="size-5 text-primary" stroke={1.8} aria-hidden="true" />
                  {t('userSystem.account.avatarDialog.choose')}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                    className="sr-only"
                    onChange={(event) => void selectFile(event)}
                  />
                </label>
              </section>
            </div>
          )}

          {error && <p className="mt-4 text-xs font-semibold text-destructive" role="alert">{error}</p>}
        </div>

        <DialogFooter className="sticky bottom-0 z-[var(--arkive-layer-local-control)] border-t border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-11 rounded-lg">
              {t('userSystem.account.avatarDialog.cancel')}
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="h-11 rounded-lg bg-primary px-5 font-semibold text-white"
            disabled={!selectedSrc || !croppedAreaPixels || Boolean(error) || processing}
            onClick={() => void applyAvatar()}
          >
            {t(processing ? 'userSystem.account.avatarDialog.processing' : 'userSystem.account.avatarDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(reader.error))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('Unable to read image')))
    image.src = src
  })
}

async function createSquareAvatar(src: string, crop: Area) {
  const image = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE,
  )

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Unable to encode avatar')),
      'image/webp',
      0.9,
    )
  })
  return readFileAsDataUrl(blob)
}

export function PublicUserProfilePage({
  userId,
  section,
  onAuthRequired,
}: {
  userId: string
  section: PublicProfileSection
  onAuthRequired: () => void
}) {
  const { t } = useTranslation()
  const profileAuth = useAuth()
  const { status } = profileAuth
  const profileClient = profileAuth.enabled ? profileAuth.client.requestClient : null
  const parsedProfileUid = Number(userId)
  const profileUid = Number.isFinite(parsedProfileUid) && parsedProfileUid > 0 ? parsedProfileUid : null
  /**
   * The profile, fetched by uid.
   *
   * This used to be a lookup in a table of three fixture ids, which was fine
   * while every author was a fixture and became a dead end the moment posts
   * carried real uids: the early return fired for every author, so clicking any
   * name in the forum landed on "no posts yet" — and it ran before the follower
   * lists, making the real ones in this change unreachable.
   *
   * Nothing about the account is invented here. The bio and the likes total were
   * fixture fields with no column behind them, so the summary shows the name,
   * avatar and follow counts the API actually returns.
   */
  const [profile, setProfile] = useState<UserPublic | null>(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 })
  const [followed, setFollowed] = useState(false)

  useEffect(() => {
    if (!profileClient || profileUid === null) {
      setProfile(null)
      setProfileLoading(false)
      return
    }
    let active = true
    setProfileLoading(true)
    void Promise.all([
      result(getUserByUid({ client: profileClient, throwOnError: true, path: { uid: profileUid } })),
      result(getFollowCounts({ client: profileClient, throwOnError: true, path: { uid: profileUid } })),
    ])
      .then(([user, counts]) => {
        if (!active) return
        setProfile(user)
        setFollowCounts({
          followers: counts.followerCount ?? 0,
          following: counts.followingCount ?? 0,
        })
        // `following` here is the reader's own relationship to this account, not
        // a tally — the two live on the same response.
        setFollowed(counts.following)
        setProfileLoading(false)
      })
      .catch(() => {
        if (!active) return
        setProfile(null)
        setProfileLoading(false)
      })
    return () => { active = false }
  }, [profileClient, profileUid])

  const toggleFollow = () => {
    if (status !== 'authenticated') {
      onAuthRequired()
      return
    }
    if (!profileClient || profileUid === null) return
    const next = !followed
    setFollowed(next)
    const op = next ? followUser : unfollowUser
    void result(op({ client: profileClient, throwOnError: true, path: { uid: profileUid } }))
      .catch(() => setFollowed(!next))
  }

  if (profileLoading) {
    return (
      <main className="user-system-main public-profile-main">
        <div className="home-shell"><p className="forum-feed-status" role="status">{t('forum.loading')}</p></div>
      </main>
    )
  }

  // A uid that names no account, rather than one missing from a fixture list.
  if (!profile) {
    return (
      <main className="user-system-main public-profile-main">
        <div className="home-shell">
          <EmptyAccountContent kind="posts" />
        </div>
      </main>
    )
  }

  return (
    <main className="user-system-main public-profile-main">
      <div className="home-shell">
        <ProfileSummary
          userId={String(profile.specialUid ?? profile.uid)}
          name={profile.name}
          avatarSrc={profile.avatarUrl}
          followerCount={followCounts.followers}
          followingCount={followCounts.following}
          action={(
            <button
              type="button"
              className={followed ? 'profile-follow-action is-followed' : 'profile-follow-action'}
              aria-pressed={followed}
              onClick={toggleFollow}
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
              <ProfilePostList uid={profileUid} client={profileClient} />
            ) : section === 'comments' ? (
              // Listing a person comments is the one endpoint this needs and the
              // backend does not have — the same gap as the forum replies tab. Two
              // invented comments stood here, attributed to a fixture author.
              <EmptyAccountContent kind="comments" />
            ) : section === 'fans' || section === 'following' ? (
              <PeopleList mode={section} uid={profileUid} client={profileClient} onAuthRequired={onAuthRequired} />
            ) : (
              // Someone else's saved posts are not public, and the API has no way to
              // ask for them — deliberately, since a bookmark is a private note.
              <EmptyAccountContent kind="favorites" />
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

/**
 * The band at the top of a profile.
 *
 * The count defaults were `12`, `27` and `136` — shown to any caller that passed
 * none, so two different profiles could display the same three figures as fact.
 * They are required now, which makes a caller state where its numbers come from.
 *
 * `bio` is optional because an account has no bio field on the API; only the
 * reader's own locally-stored one exists. And `likeCount` is gone for the reason
 * given on the forum's own profile band: it needs a server aggregate, and a page
 * total dressed as a lifetime one is worse than no figure.
 */
function ProfileSummary({
  userId,
  name,
  bio,
  avatarSeed,
  avatarSrc,
  followerCount,
  followingCount,
  ownProfile = false,
  action,
}: {
  userId: string
  name: string
  bio?: string
  avatarSeed?: string
  avatarSrc?: string
  followerCount: number
  followingCount: number
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
      <img className="profile-summary-avatar" src={avatarSrc ?? (avatarSeed ? avatarUrl(avatarSeed, 192) : DEFAULT_AVATAR_SRC)} alt="" />
      <div className="profile-summary-copy">
        <div className="profile-summary-name-row">
          <h1>{name}</h1>
          {ownProfile && <span>{t('userSystem.currentUser.badge')}</span>}
        </div>
        <p className="profile-account-id">{t('userSystem.publicProfile.accountId', { id: userId })}</p>
        {bio && <p className="profile-bio">{bio}</p>}
        <dl>
          <div><dd>{formatter.format(followerCount)}</dd><dt>{t('userSystem.publicProfile.fans')}</dt></div>
          <div><dd>{formatter.format(followingCount)}</dd><dt>{t('userSystem.publicProfile.following')}</dt></div>
        </dl>
      </div>
      {action && <div className="profile-summary-action">{action}</div>}
    </section>
  )
}

/**
 * A profile's posts, from the feed.
 *
 * Two fixture posts before this, with a hard-coded "1 comment, 23 likes" and a
 * relative time that read "this week" forever. `authorUid` is what makes it that
 * person's: the same filter the forum's own profile view uses.
 *
 * The favourites mode is deliberately absent rather than ported. A bookmark is
 * private — the API scopes "posts I saved" to the caller and offers no way to ask
 * for anyone else's, which is the right shape — so a public profile cannot show
 * them, and the fixtures that did were showing something the site should not.
 */
function ProfilePostList({
  uid,
  client,
  bookmarked = false,
}: {
  /** Whose posts. Ignored when `bookmarked` is set. */
  uid: number | null
  client: ApiClient['client'] | null
  /** The reader's own saved posts instead of an author feed. */
  bookmarked?: boolean
}) {
  const { t } = useTranslation()
  const [posts, setPosts] = useState<PostRead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client || (!bookmarked && uid === null)) {
      setPosts([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    void result(listForumPosts({
      client,
      throwOnError: true,
      query: bookmarked
        ? { bookmarked: true, sort: 'new', page: 1, pageSize: 20 }
        : { authorUid: uid ?? undefined, sort: 'new', page: 1, pageSize: 20 },
    }))
      .then((page) => {
        if (!active) return
        setPosts(page.results ?? [])
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setPosts([])
        setLoading(false)
      })
    return () => { active = false }
  }, [bookmarked, client, uid])

  if (loading) return <p className="forum-feed-status" role="status">{t('forum.loading')}</p>
  if (posts.length === 0) return <EmptyAccountContent kind={bookmarked ? "favorites" : "posts"} />

  return (
    <div className="profile-post-list">
      {posts.map((post) => {
        const gameIds = post.gameIds ?? []
        const site = gameIds.length ? SITES.find((item) => item.id === gameIds[0]) : undefined
        return (
          <article key={post.postNo} className="user-panel profile-post-card">
            <div className="profile-post-copy">
              <time dateTime={post.createdAt}>{calendarDate(post.createdAt)}</time>
              {/* Not a link: the forum opens a post through component state, so
                  there is no URL for one yet. An anchor to #forum would land the
                  reader on the feed while looking like it points at the post. A
                  shareable per-post route is the gap to close. */}
              <h2>{post.title}</h2>
              <p>{post.body}</p>
              <footer>
                <span><IconMessageCircle className="size-4" stroke={1.8} />{t('userSystem.content.commentsCount', { count: post.commentCount })}</span>
                <span><IconThumbUp className="size-4" stroke={1.8} />{t('userSystem.content.likesCount', { count: post.likeCount })}</span>
              </footer>
            </div>
            {(post.images?.[0]?.url ?? site?.bg) && (
              <img src={post.images?.[0]?.url ?? site?.bg} alt={post.title} />
            )}
          </article>
        )
      })}
    </div>
  )
}

/**
 * The reader's saved games and saved posts.
 *
 * The posts half matched stored bookmark ids against a table of five fixture
 * posts, so it could only ever show those five — and after the fixtures' copy was
 * removed it would have rendered locale keys for anyone whose browser still held
 * one of those ids. It asks the server for the posts you bookmarked now.
 *
 * Followed games stay local: a game favourite is a browser preference with no
 * table behind it, unlike a post bookmark.
 */
function FavoriteContent({ client }: { client: ApiClient['client'] | null }) {
  const { t } = useTranslation()
  const { state } = useUserSystem()
  const favoriteGames = SITES.filter((site) => state.favoriteGameIds.includes(site.id))

  return (
    <div className="favorite-content-stack">
      {favoriteGames.length > 0 && (
        <section aria-labelledby="favorite-games-heading">
          <h2 id="favorite-games-heading">{t('userSystem.content.favoriteGames')}</h2>
          <div className="favorite-game-grid">
            {favoriteGames.map((site) => {
              const href = siteHref(site)
              const content = (
                <>
                  <img src={site.bg} alt="" />
                  <span>{t(site.nameKey)}</span>
                </>
              )
              return href
                ? <a key={site.id} className="user-panel" href={href}>{content}</a>
                : <div key={site.id} className="user-panel">{content}</div>
            })}
          </div>
        </section>
      )}
      <section aria-labelledby="favorite-posts-heading">
        <h2 id="favorite-posts-heading">{t('userSystem.content.favoritePosts')}</h2>
        <ProfilePostList uid={null} client={client} bookmarked />
      </section>
    </div>
  )
}


function EmptyAccountContent({ kind }: { kind: 'favorites' | 'posts' | 'comments' | 'fans' | 'following' }) {
  const { t } = useTranslation()
  const Icon = kind === 'favorites'
    ? IconBookmark
    : kind === 'comments'
      ? IconMessageCircle
      : kind === 'fans' || kind === 'following'
        ? IconUsers
        : IconFileText
  return (
    <div className="user-panel user-content-empty" role="status">
      <Icon className="size-8" stroke={1.5} aria-hidden="true" />
      <strong>{t(`userSystem.empty.${kind}.title`)}</strong>
      <p>{t(`userSystem.empty.${kind}.description`)}</p>
    </div>
  )
}


/**
 * The followers and following lists.
 *
 * These showed the same four invented people to everyone, with a preview toggle
 * that pretended to follow them locally. They are the real relationships now:
 * `/users/{uid}/followers` and `/users/{uid}/following`, which the backend
 * already serves. There is no description under a name any more — the fixtures
 * had a one-line bio each, and an account has no such field.
 *
 * `uid` is whose lists these are: the reader's own on the account pages, and the
 * profile's owner on a public one.
 */
function PeopleList({
  mode,
  uid,
  client,
  ownProfile = false,
  onAuthRequired,
}: {
  mode: 'fans' | 'following'
  uid: number | null
  client: ApiClient['client'] | null
  ownProfile?: boolean
  onAuthRequired: () => void
}) {
  const { t } = useTranslation()
  const { status } = useAuth()
  const [people, setPeople] = useState<FollowRead[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [following, setFollowing] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    if (!client || uid === null) {
      setPeople([])
      return
    }
    let active = true
    setLoading(true)
    setFailed(false)
    const load = mode === 'fans' ? listFollowers : listFollowing
    void result(load({ client, throwOnError: true, path: { uid }, query: { page: 1, pageSize: 100 } }))
      .then((page) => {
        if (!active) return
        const rows = page.results ?? []
        setPeople(rows)
        // On your own "following" list every row is by definition followed, which
        // is what the button state starts from. On a followers list it is unknown
        // without a request per row, so those start unfollowed.
        if (mode === 'following') setFollowing(new Set(rows.map((row) => row.user.uid)))
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setPeople([])
        setFailed(true)
        setLoading(false)
      })
    return () => { active = false }
  }, [client, mode, uid])

  const toggle = (targetUid: number) => {
    // The other two follow buttons ask for sign-in; this one fired the request and
    // let the 401 revert it, so a signed-out visitor saw the button fill and
    // silently empty again instead of being asked to sign in.
    if (status !== 'authenticated') {
      onAuthRequired()
      return
    }
    if (!client) return
    const next = !following.has(targetUid)
    setFollowing((current) => {
      const updated = new Set(current)
      if (next) updated.add(targetUid)
      else updated.delete(targetUid)
      return updated
    })
    const op = next ? followUser : unfollowUser
    void result(op({ client, throwOnError: true, path: { uid: targetUid } })).catch(() => {
      // Put the button back rather than leaving it claiming a relationship the
      // server does not have.
      setFollowing((current) => {
        const reverted = new Set(current)
        if (next) reverted.delete(targetUid)
        else reverted.add(targetUid)
        return reverted
      })
    })
  }

  if (loading) return <div className="user-panel people-list"><p className="forum-feed-status" role="status">{t('forum.loading')}</p></div>
  if (failed) return <div className="user-panel people-list"><p className="forum-feed-status is-error" role="alert">{t('forum.errors.feed')}</p></div>
  if (people.length === 0) return <EmptyAccountContent kind={mode} />

  return (
    <div className="user-panel people-list">
      {people.map(({ user }) => {
        const isFollowed = following.has(user.uid)
        const href = publicProfileHref(String(user.uid))
        return (
          <article key={user.uid}>
            <a href={href}><img src={user.avatarUrl} alt="" /></a>
            <span>
              <a href={href}>{user.name}</a>
              <small>{t('userSystem.content.accountNumber', { id: user.specialUid ?? user.uid })}</small>
            </span>
            {/* No Follow button against your own row on your own list. */}
            {!(ownProfile && uid === user.uid) && (
              <button type="button" className={isFollowed ? 'is-followed' : undefined} onClick={() => toggle(user.uid)}>
                {t(isFollowed ? 'forum.users.following' : 'forum.users.follow')}
              </button>
            )}
          </article>
        )
      })}
    </div>
  )
}

function PrivacySettings() {
  const { t } = useTranslation()
  const { state, setPrivacySetting } = useUserSystem()

  return (
    <div className="user-panel privacy-settings">
      {Object.entries(state.privacySettings).map(([key, checked]) => (
        <div key={key}>
          <span>
            <strong>{t(`userSystem.privacy.${key}.title`)}</strong>
            <small>{t(`userSystem.privacy.${key}.description`)}</small>
          </span>
          <SwitchControl
            checked={checked}
            label={t(`userSystem.privacy.${key}.title`)}
            onChange={() => setPrivacySetting(key as PrivacyPreferenceKey, !checked)}
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
