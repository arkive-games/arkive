import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthError, useAuth } from '@gamemap/auth'
import { browserMemory, defineMemoryRecord } from '@gamemap/state-memory'
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
  IconVideo,
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
} from '@gamemap/ui'
import { SITES, siteHref } from './sites'
import { AVATAR_PRESETS, DEFAULT_AVATAR_SRC } from './avatarPresets'
import {
  avatarUrl,
  findPublicProfile,
  publicProfileHref,
  RECOMMENDED_USERS,
} from './userSystemData'
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
  { key: 'vrising', postId: 'vrising-routes', siteId: 'vrising' },
  { key: 'aion2', postId: 'aion2-build', siteId: 'aion2' },
  { key: 'palworld', postId: 'palworld-work', siteId: 'palworld' },
  { key: 'general', postId: 'collection-progress', siteId: 'sts2' },
  { key: 'official', postId: 'community-guide', siteId: 'aion2' },
] as const


export function NotificationCenterPage({ section }: { section: NotificationSection }) {
  const { t } = useTranslation()
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
  const auth = useAuth()
  const { state, updateLocalProfile } = useUserSystem()
  const user = auth.user
  const profileDraftRecord = useMemo(() => defineMemoryRecord({
    id: 'profile', namespace: 'site', surface: 'account-editor', stateClass: 'task_draft',
    schemaVersion: '1.0.0',
    defaultValue: () => ({
      name: user?.name ?? '',
      email: user?.email ?? '',
      bio: state.profile.bio,
    }),
    validate: (value: unknown): value is { name: string; email: string; bio: string } => {
      if (!value || typeof value !== 'object') return false
      const draft = value as Record<string, unknown>
      return typeof draft.name === 'string' && draft.name.length <= 64
        && typeof draft.email === 'string' && draft.email.length <= 320
        && typeof draft.bio === 'string' && draft.bio.length <= 120
    },
    retentionMs: 30 * 24 * 60 * 60 * 1_000,
    accountScoped: true,
  }), [state.profile.bio, user?.email, user?.name])
  const [profile, setProfile] = useState(() => user
    ? browserMemory.read(profileDraftRecord, { accountId: user.id })
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
    setProfile(browserMemory.read(profileDraftRecord, { accountId: user.id }))
  }, [profileDraftRecord, user])

  useEffect(() => {
    if (!user) return
    if (skipNextDraftWrite.current) {
      skipNextDraftWrite.current = false
      return
    }
    const timeout = window.setTimeout(() => {
      browserMemory.write(profileDraftRecord, profile, { accountId: user.id })
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
          userId={user.id}
          name={profile.name}
          bio={profile.bio || t('userSystem.account.emptyBio')}
          avatarSeed={user.id}
          avatarSrc={avatarSrc}
          followerCount={0}
          followingCount={state.followedUserIds.length}
          likeCount={0}
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
              userId={user.id}
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
  verified,
  avatarSrc,
  saveStatus,
  saveError,
  onSave,
  onEdit,
  onProfileChange,
  onAvatarChange,
}: {
  section: AccountSection
  profile: { name: string; email: string; bio: string }
  userId: string
  verified: boolean
  avatarSrc: string
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saveError: string
  onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onEdit: () => void
  onProfileChange: (field: 'name' | 'email' | 'bio', value: string) => void
  onAvatarChange: (src: string) => void
}) {
  const { t } = useTranslation()

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
        <FormField label={t('userSystem.account.fields.email')}>
          <input
            name="email"
            type="email"
            value={profile.email}
            onChange={(event) => onProfileChange('email', event.target.value)}
            maxLength={320}
            required
            autoComplete="email"
          />
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

  if (section === 'favorites') return <FavoriteContent />
  if (section === 'comments') return <EmptyAccountContent kind="comments" />
  if (section === 'posts') return <AuthoredPostContent />
  if (section === 'fans') return <EmptyAccountContent kind="fans" />
  if (section === 'following') return <PeopleList mode="following" ownProfile />
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
        overlayClassName="z-[3000] bg-black/55 backdrop-blur-sm"
        className="z-[3001] max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-2xl border-border bg-card p-0 text-card-foreground shadow-2xl"
      >
        <div className="relative overflow-hidden border-b border-border bg-muted/30 px-6 pb-5 pt-7">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-primary" aria-hidden="true" />
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 rounded-full text-muted-foreground hover:text-foreground"
              aria-label={t('userSystem.account.avatarDialog.close')}
            >
              <IconX className="size-5" stroke={1.8} />
            </Button>
          </DialogClose>
          <DialogHeader className="pr-9 text-left">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <IconPhoto className="size-6" stroke={1.7} aria-hidden="true" />
              </span>
              <DialogTitle className="text-xl font-bold tracking-tight">
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

                <Button type="button" variant="outline" className="w-full rounded-xl" onClick={resetCrop}>
                  <IconRefresh className="size-4" stroke={1.8} />
                  {t('userSystem.account.avatarDialog.reset')}
                </Button>

                <div className="space-y-2">
                  <p className="truncate text-xs text-muted-foreground" title={fileName}>{fileName}</p>
                  <label
                    className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring"
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
                  className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 focus-within:ring-2 focus-within:ring-ring"
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

        <DialogFooter className="sticky bottom-0 z-10 border-t border-border bg-card/95 px-6 py-4 backdrop-blur-sm">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="h-11 rounded-xl">
              {t('userSystem.account.avatarDialog.cancel')}
            </Button>
          </DialogClose>
          <Button
            type="button"
            className="h-11 rounded-xl bg-primary px-5 font-semibold text-white"
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
  const { status } = useAuth()
  const profile = findPublicProfile(userId)
  const { state, toggleFollowedUser } = useUserSystem()
  const followed = state.followedUserIds.includes(userId)

  // An unknown id has no profile to show. Rendering the first fixture instead --
  // which is what the previous fallback did -- attributed one person's name, bio
  // and follower counts to whatever id happened to be in the hash.
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
              onClick={() => status === 'authenticated' ? toggleFollowedUser(userId) : onAuthRequired()}
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
  avatarSrc,
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
  avatarSrc?: string
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
      <img className="profile-summary-avatar" src={avatarSrc ?? avatarUrl(avatarSeed, 192)} alt="" />
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

  if (keys.length === 0) return <EmptyAccountContent kind={mode} />

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

function FavoriteContent() {
  const { t } = useTranslation()
  const { state } = useUserSystem()
  const bookmarkedKeys = POST_FIXTURES
    .filter((fixture) => state.bookmarkedPostIds.includes(fixture.postId))
    .map((fixture) => fixture.key)
  const favoriteGames = SITES.filter((site) => state.favoriteGameIds.includes(site.id))

  if (bookmarkedKeys.length === 0 && favoriteGames.length === 0) {
    return <EmptyAccountContent kind="favorites" />
  }

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
      {bookmarkedKeys.length > 0 && (
        <section aria-labelledby="favorite-posts-heading">
          <h2 id="favorite-posts-heading">{t('userSystem.content.favoritePosts')}</h2>
          <ProfilePostList mode="favorites" postKeys={bookmarkedKeys} />
        </section>
      )}
    </div>
  )
}

function AuthoredPostContent() {
  const { t, i18n } = useTranslation()
  const { state } = useUserSystem()
  const formatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium' }),
    [i18n.language, i18n.resolvedLanguage],
  )

  if (state.publishedPosts.length === 0) return <EmptyAccountContent kind="posts" />

  return (
    <div className="profile-post-list">
      {state.publishedPosts.map((post) => {
        const site = post.gameId ? SITES.find((item) => item.id === post.gameId) : undefined
        const image = post.imageSrc ?? site?.bg
        return (
          <article key={post.id} className="user-panel profile-post-card authored-post-card">
            <div className="profile-post-copy">
              <time dateTime={post.createdAt}>{formatter.format(new Date(post.createdAt))}</time>
              <h2><a href="#forum">{post.title}</a></h2>
              <p>{post.content}</p>
              <footer>
                {site && <span>{t(site.nameKey)}</span>}
                <span>{t(`forum.composer.topics.${post.topic}`)}</span>
                {post.videoUrl && (
                  <a href={post.videoUrl} target="_blank" rel="noreferrer">
                    <IconVideo className="size-4" stroke={1.8} aria-hidden="true" />
                    {t('forum.composer.openVideo')}
                  </a>
                )}
              </footer>
            </div>
            {image && <img src={image} alt="" />}
          </article>
        )
      })}
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

function CommentHistory({ publicProfile = false }: { publicProfile?: boolean }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { state } = useUserSystem()
  const currentAvatar = state.profile.avatarSrc ?? DEFAULT_AVATAR_SRC
  return (
    <div className="user-panel comment-history">
      {[0, 1].map((index) => (
        <article key={index}>
          <img src={publicProfile ? avatarUrl('arkive-dusk-raven') : currentAvatar} alt="" />
          <div>
            <header>
              <strong>{publicProfile ? t('forum.posts.vrising.author') : user?.name}</strong>
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

function PeopleList({ mode, ownProfile = false }: { mode: 'fans' | 'following'; ownProfile?: boolean }) {
  const { t } = useTranslation()
  const { state, toggleFollowedUser } = useUserSystem()
  const [previewFollowed, setPreviewFollowed] = useState<Set<string>>(
    () => new Set(mode === 'following' ? RECOMMENDED_USERS.map((person) => person.id) : []),
  )
  const visiblePeople = ownProfile
    ? RECOMMENDED_USERS.filter((person) => state.followedUserIds.includes(person.id))
    : RECOMMENDED_USERS

  const toggle = (id: string) => {
    if (ownProfile) {
      toggleFollowedUser(id)
      return
    }
    setPreviewFollowed((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (visiblePeople.length === 0) return <EmptyAccountContent kind={mode} />

  return (
    <div className="user-panel people-list">
      {visiblePeople.map((person) => {
        const isFollowed = ownProfile
          ? state.followedUserIds.includes(person.id)
          : previewFollowed.has(person.id)
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
