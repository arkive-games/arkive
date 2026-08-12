import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@gamemap/auth'
import {
  MemoryClient,
  browserMemory,
  defineMemoryRecord,
  memoryPolicy,
  parseJson,
  type StorageLike,
} from '@gamemap/state-memory'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'

export type NotificationPreferenceKey = 'replies' | 'mentions' | 'likes' | 'follows' | 'system' | 'browser'
export type NotificationInboxSection = 'replies' | 'mentions' | 'likes' | 'system'
export type PrivacyPreferenceKey = 'profile' | 'posts' | 'activity'

export interface LocalForumPost {
  id: string
  title: string
  content: string
  channel: 'general' | 'games'
  gameId: string | null
  gameIds: string[]
  topic: string
  topics: string[]
  tags: string[]
  imageSrc: string | null
  imageSrcs: string[]
  videoUrl: string | null
  createdAt: string
}

export interface UserSystemState {
  profile: {
    bio: string
    avatarSrc: string | null
    gender: 'female' | 'male' | null
  }
  notificationSettings: Record<NotificationPreferenceKey, boolean>
  readNotificationSections: NotificationInboxSection[]
  privacySettings: Record<PrivacyPreferenceKey, boolean>
  followedUserIds: string[]
  bookmarkedPostIds: string[]
  likedPostIds: string[]
  likedCommentIds: string[]
  favoriteGameIds: string[]
  publishedPosts: LocalForumPost[]
}

interface UserSystemContextValue {
  state: UserSystemState
  updateLocalProfile: (profile: Partial<UserSystemState['profile']>) => void
  toggleNotificationSetting: (key: NotificationPreferenceKey) => void
  markNotificationSectionRead: (section: NotificationInboxSection) => void
  setPrivacySetting: (key: PrivacyPreferenceKey, value: boolean) => void
  toggleFollowedUser: (userId: string) => void
  toggleBookmarkedPost: (postId: string) => void
  toggleLikedPost: (postId: string) => void
  toggleLikedComment: (commentId: string) => void
  toggleFavoriteGame: (gameId: string) => void
  publishForumPost: (post: LocalForumPost) => boolean
}

const STORAGE_PREFIX = 'arkive.meta.user-system.v1'

export function createDefaultUserSystemState(): UserSystemState {
  return {
    profile: { bio: '', avatarSrc: DEFAULT_AVATAR_SRC, gender: 'female' },
    notificationSettings: {
      replies: true,
      mentions: true,
      likes: true,
      follows: true,
      system: true,
      browser: false,
    },
    readNotificationSections: [],
    privacySettings: { profile: true, posts: true, activity: false },
    followedUserIds: [],
    bookmarkedPostIds: [],
    likedPostIds: [],
    likedCommentIds: [],
    favoriteGameIds: [],
    publishedPosts: [],
  }
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}:${userId}`
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function localForumPosts(value: unknown): LocalForumPost[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): LocalForumPost[] => {
    if (!item || typeof item !== 'object') return []
    const post = item as Partial<LocalForumPost>
    const valid = typeof post.id === 'string'
      && typeof post.title === 'string'
      && typeof post.content === 'string'
      && (post.channel === 'general' || post.channel === 'games')
      && (post.gameId === null || typeof post.gameId === 'string')
      && typeof post.topic === 'string'
      && (post.imageSrc === null || typeof post.imageSrc === 'string')
      && (post.videoUrl === null || typeof post.videoUrl === 'string')
      // Parseable, not merely a string: the account page formats this with
      // Intl.DateTimeFormat, which throws RangeError on an Invalid Date. With no
      // error boundary above it, a stored "yesterday" blanked the whole page.
      && typeof post.createdAt === 'string'
      && !Number.isNaN(Date.parse(post.createdAt))
    if (!valid) return []

    const gameIds = stringArray(post.gameIds)
    if (gameIds.length === 0 && post.gameId) gameIds.push(post.gameId)
    const topics = stringArray(post.topics)
    if (topics.length === 0 && post.topic) topics.push(post.topic)
    const imageSrcs = stringArray(post.imageSrcs)
    if (imageSrcs.length === 0 && post.imageSrc) imageSrcs.push(post.imageSrc)

    return [{
      id: post.id!,
      title: post.title!,
      content: post.content!,
      channel: post.channel!,
      gameId: gameIds[0] ?? null,
      gameIds,
      topic: topics[0] ?? 'discussion',
      topics,
      tags: stringArray(post.tags),
      imageSrc: imageSrcs[0] ?? null,
      imageSrcs,
      videoUrl: post.videoUrl ?? null,
      createdAt: post.createdAt!,
    }]
  })
}

function persistentImageSource(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function persistableForumPost(post: LocalForumPost): LocalForumPost {
  const imageSrcs = post.imageSrcs.filter(persistentImageSource)
  if (imageSrcs.length === 0 && post.imageSrc && persistentImageSource(post.imageSrc)) {
    imageSrcs.push(post.imageSrc)
  }
  return { ...post, imageSrc: imageSrcs[0] ?? null, imageSrcs }
}

function persistableForumPosts(posts: LocalForumPost[]) {
  return posts.map(persistableForumPost)
}

function isPersistableForumPost(value: unknown): value is LocalForumPost {
  if (!value || typeof value !== 'object') return false
  const post = value as Partial<LocalForumPost>
  return typeof post.id === 'string'
    && typeof post.title === 'string'
    && typeof post.content === 'string'
    && (post.channel === 'general' || post.channel === 'games')
    && (post.gameId === null || typeof post.gameId === 'string')
    && Array.isArray(post.gameIds) && post.gameIds.every((item) => typeof item === 'string')
    && typeof post.topic === 'string'
    && Array.isArray(post.topics) && post.topics.every((item) => typeof item === 'string')
    && Array.isArray(post.tags) && post.tags.every((item) => typeof item === 'string')
    && (post.imageSrc === null || (typeof post.imageSrc === 'string' && persistentImageSource(post.imageSrc)))
    && Array.isArray(post.imageSrcs)
    && post.imageSrcs.every((item) => typeof item === 'string' && persistentImageSource(item))
    && (post.videoUrl === null || typeof post.videoUrl === 'string')
    && typeof post.createdAt === 'string'
    && !Number.isNaN(Date.parse(post.createdAt))
}

function normalizeUserSystemState(value: unknown): UserSystemState {
  const defaults = createDefaultUserSystemState()
  const parsed = value && typeof value === 'object' ? value as Partial<UserSystemState> : {}
  return {
    profile: {
      bio: typeof parsed.profile?.bio === 'string' ? parsed.profile.bio : defaults.profile.bio,
      avatarSrc: typeof parsed.profile?.avatarSrc === 'string' && parsed.profile.avatarSrc
        ? parsed.profile.avatarSrc
        : defaults.profile.avatarSrc,
      gender: parsed.profile?.gender === 'female' || parsed.profile?.gender === 'male'
        ? parsed.profile.gender
        : defaults.profile.gender,
    },
    notificationSettings: booleanRecord(defaults.notificationSettings, parsed.notificationSettings),
    readNotificationSections: stringArray(parsed.readNotificationSections)
      .filter((section): section is NotificationInboxSection => ['replies', 'mentions', 'likes', 'system'].includes(section)),
    privacySettings: booleanRecord(defaults.privacySettings, parsed.privacySettings),
    followedUserIds: stringArray(parsed.followedUserIds),
    bookmarkedPostIds: stringArray(parsed.bookmarkedPostIds),
    likedPostIds: stringArray(parsed.likedPostIds),
    likedCommentIds: stringArray(parsed.likedCommentIds),
    favoriteGameIds: stringArray(parsed.favoriteGameIds),
    publishedPosts: localForumPosts(parsed.publishedPosts),
  }
}

function isUserSystemState(value: unknown): value is UserSystemState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<UserSystemState>
  return Boolean(state.profile)
    && typeof state.profile?.bio === 'string'
    && (state.profile.avatarSrc === null || typeof state.profile.avatarSrc === 'string')
    && (state.profile.gender === null || state.profile.gender === 'female' || state.profile.gender === 'male')
    && Boolean(state.notificationSettings)
    && Boolean(state.privacySettings)
    && [state.readNotificationSections, state.followedUserIds, state.bookmarkedPostIds,
      state.likedPostIds, state.likedCommentIds, state.favoriteGameIds, state.publishedPosts]
      .every(Array.isArray)
}

type UserProfileState = UserSystemState['profile']
type UserSettingsState = Pick<UserSystemState, 'notificationSettings' | 'privacySettings'>
type UserProgressState = Pick<UserSystemState,
  'readNotificationSections' | 'followedUserIds' | 'bookmarkedPostIds'
  | 'likedPostIds' | 'likedCommentIds' | 'favoriteGameIds'>
type LegacyUserProgressState = UserProgressState & { publishedPosts?: LocalForumPost[] }

function legacyUserSystemRecord(userId: string) {
  return defineMemoryRecord({
    id: 'legacy-snapshot', namespace: 'site', surface: 'user-system',
    ...memoryPolicy.durableProgress('clear-account-snapshot'),
    schemaVersion: '1.0.0', defaultValue: () => null as UserSystemState | null,
    validate: (value: unknown): value is UserSystemState | null => value === null || isUserSystemState(value),
    partition: { account: true },
    signInAdoption: 'keep_anonymous',
    legacyKeys: [storageKey(userId)],
    migrateLegacy: (raw: string) => normalizeUserSystemState(parseJson(raw)),
  })
}

const profileRecord = defineMemoryRecord({
  id: 'profile-content', namespace: 'site', surface: 'user-system',
  ...memoryPolicy.durableProgress('clear-account-profile'),
  schemaVersion: '1.0.0', defaultValue: () => createDefaultUserSystemState().profile,
  validate: (value: unknown): value is UserProfileState => Boolean(value)
    && typeof value === 'object'
    && typeof (value as Partial<UserProfileState>).bio === 'string'
    && ((value as Partial<UserProfileState>).avatarSrc === null
      || typeof (value as Partial<UserProfileState>).avatarSrc === 'string')
    && ((value as Partial<UserProfileState>).gender === undefined
      || (value as Partial<UserProfileState>).gender === null
      || (value as Partial<UserProfileState>).gender === 'female'
      || (value as Partial<UserProfileState>).gender === 'male'),
  partition: { account: true },
  signInAdoption: 'keep_anonymous',
})

const settingsRecord = defineMemoryRecord({
  id: 'settings', namespace: 'site', surface: 'user-system',
  ...memoryPolicy.userPreference('reset-account-preferences'),
  schemaVersion: '1.0.0',
  defaultValue: (): UserSettingsState => {
    const defaults = createDefaultUserSystemState()
    return { notificationSettings: defaults.notificationSettings, privacySettings: defaults.privacySettings }
  },
  validate: (value: unknown): value is UserSettingsState => Boolean(value)
    && typeof value === 'object'
    && Boolean((value as Partial<UserSettingsState>).notificationSettings)
    && Boolean((value as Partial<UserSettingsState>).privacySettings),
  partition: { account: true },
  signInAdoption: 'keep_anonymous',
})

/** The progress slice of a full state, without the fields the other records own.
 *  A destructure-to-discard reads well but trips no-unused-vars on the three
 *  discarded bindings, so pick the kept keys explicitly instead. */
function progressOf(state: UserSystemState): UserProgressState {
  return {
    readNotificationSections: state.readNotificationSections,
    followedUserIds: state.followedUserIds,
    bookmarkedPostIds: state.bookmarkedPostIds,
    likedPostIds: state.likedPostIds,
    likedCommentIds: state.likedCommentIds,
    favoriteGameIds: state.favoriteGameIds,
  }
}

const progressRecord = defineMemoryRecord({
  id: 'progress', namespace: 'site', surface: 'user-system',
  ...memoryPolicy.durableProgress('clear-account-progress'),
  schemaVersion: '1.0.0',
  defaultValue: (): LegacyUserProgressState => {
    return progressOf(createDefaultUserSystemState())
  },
  validate: (value: unknown): value is LegacyUserProgressState => {
    if (!value || typeof value !== 'object') return false
    const progress = value as Partial<LegacyUserProgressState>
    const progressArrays = [progress.readNotificationSections, progress.followedUserIds,
      progress.bookmarkedPostIds, progress.likedPostIds, progress.likedCommentIds, progress.favoriteGameIds]
    return progressArrays.every(Array.isArray)
      && (progress.publishedPosts === undefined || Array.isArray(progress.publishedPosts))
  },
  partition: { account: true },
  signInAdoption: 'keep_anonymous',
})

const publishedPostsRecord = defineMemoryRecord({
  id: 'authored-posts', namespace: 'site', surface: 'user-system',
  ...memoryPolicy.durableProgress('clear-account-posts'),
  schemaVersion: '1.0.0',
  defaultValue: () => [] as LocalForumPost[],
  validate: (value: unknown): value is LocalForumPost[] => Array.isArray(value)
    && value.every(isPersistableForumPost),
  partition: { account: true },
  signInAdoption: 'keep_anonymous',
})

function writeProfileState(client: MemoryClient, userId: string, state: UserSystemState) {
  return client.write(profileRecord, state.profile, { accountId: userId })
}

function writeSettingsState(client: MemoryClient, userId: string, state: UserSystemState) {
  return client.write(settingsRecord, {
    notificationSettings: state.notificationSettings,
    privacySettings: state.privacySettings,
  }, { accountId: userId })
}

function writeProgressState(client: MemoryClient, userId: string, state: UserSystemState) {
  return client.write(progressRecord, progressOf(state), { accountId: userId })
}

function writePublishedPostsState(client: MemoryClient, userId: string, state: UserSystemState) {
  return client.write(publishedPostsRecord, persistableForumPosts(state.publishedPosts), { accountId: userId })
}

function writeUserSystemStateWithClient(client: MemoryClient, userId: string, state: UserSystemState) {
  const profileSaved = writeProfileState(client, userId, state)
  const settingsSaved = writeSettingsState(client, userId, state)
  const progressSaved = writeProgressState(client, userId, state)
  const postsSaved = writePublishedPostsState(client, userId, state)
  return profileSaved && settingsSaved && progressSaved && postsSaved
}

function readUserSystemStateWithClient(client: MemoryClient, userId: string): UserSystemState {
  const scope = { accountId: userId }
  const legacyRecord = legacyUserSystemRecord(userId)
  const legacy = client.read(legacyRecord, scope)
  if (legacy) {
    // Normalize before filtering, matching the sibling call below. `isUserSystemState`
    // only checks that publishedPosts is an array, so an entry without `imageSrcs`
    // -- the shape older builds wrote -- would reach `.imageSrcs.filter` and throw
    // inside the provider effect. Unreachable today, because this record has no
    // writer and its only source is `migrateLegacy`, which normalizes; the guard
    // is here so that stays true if anything ever writes it.
    const migrated = {
      ...legacy,
      publishedPosts: persistableForumPosts(localForumPosts(legacy.publishedPosts)),
    }
    if (writeUserSystemStateWithClient(client, userId, migrated)) client.clear(legacyRecord, scope)
    return migrated
  }
  const defaults = createDefaultUserSystemState()
  const profile = client.read(profileRecord, scope)
  const settings = client.read(settingsRecord, scope)
  const progress = client.read(progressRecord, scope)
  let publishedPosts = client.read(publishedPostsRecord, scope)
  const legacyPosts = persistableForumPosts(localForumPosts(progress.publishedPosts))
  if (progress.publishedPosts !== undefined) {
    let postsMigrated = publishedPosts.length > 0 || legacyPosts.length === 0
    if (publishedPosts.length === 0 && legacyPosts.length > 0) {
      if (client.write(publishedPostsRecord, legacyPosts, scope)) {
        publishedPosts = legacyPosts
        postsMigrated = true
      }
    }
    if (postsMigrated) {
      client.write(progressRecord, progressOf(normalizeUserSystemState({ ...defaults, ...progress })), scope)
    }
  }
  return normalizeUserSystemState({ ...defaults, ...progress, ...settings, profile, publishedPosts })
}

/** Boolean-only merge: stored settings are untrusted JSON, and a non-boolean
 *  reached `aria-checked` verbatim and made the toggle appear dead. */
function booleanRecord<K extends string>(
  defaults: Record<K, boolean>,
  parsed: unknown,
): Record<K, boolean> {
  const source = (parsed ?? {}) as Partial<Record<K, unknown>>
  const merged = { ...defaults }
  for (const key of Object.keys(defaults) as K[]) {
    if (typeof source[key] === 'boolean') merged[key] = source[key]
  }
  return merged
}

/** Bridge helpers preserve the public storage-like API while routing validation,
 *  account scoping, and restricted-storage handling through the memory client. */
export function readUserSystemState(storage: Pick<Storage, 'getItem'>, userId: string): UserSystemState {
  const adapter: StorageLike = {
    getItem: storage.getItem.bind(storage),
    setItem: () => undefined,
    removeItem: () => undefined,
  }
  return readUserSystemStateWithClient(new MemoryClient({ deviceStorage: adapter }), userId)
}

export function writeUserSystemState(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  state: UserSystemState,
) {
  const adapter: StorageLike = {
    getItem: () => null,
    setItem: storage.setItem.bind(storage),
    removeItem: () => undefined,
  }
  return writeUserSystemStateWithClient(new MemoryClient({ deviceStorage: adapter }), userId, state)
}

const UserSystemContext = createContext<UserSystemContextValue | null>(null)

export function UserSystemProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const previousUserId = useRef<string | null>(null)
  const [entry, setEntry] = useState<{ userId: string | null; state: UserSystemState }>(() => ({
    userId: null,
    state: createDefaultUserSystemState(),
  }))
  const entryRef = useRef(entry)

  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) {
      browserMemory.clearAccount(previousUserId.current)
    }
    previousUserId.current = userId
    const nextEntry = {
      userId,
      state: userId
        ? readUserSystemStateWithClient(browserMemory, userId)
        : createDefaultUserSystemState(),
    }
    entryRef.current = nextEntry
    setEntry(nextEntry)
  }, [userId])

  const update = useCallback((
    mutate: (current: UserSystemState) => UserSystemState,
    write: (client: MemoryClient, accountId: string, state: UserSystemState) => boolean,
  ) => {
    if (!userId) return false
    const currentEntry = entryRef.current
    const current = currentEntry.userId === userId
      ? currentEntry.state
      : readUserSystemStateWithClient(browserMemory, userId)
    const next = mutate(current)
    if (!write(browserMemory, userId, next)) return false
    const nextEntry = { userId, state: next }
    entryRef.current = nextEntry
    setEntry(nextEntry)
    return true
  }, [userId])

  const toggleListValue = useCallback((key: keyof Pick<
    UserSystemState,
    'followedUserIds' | 'bookmarkedPostIds' | 'likedPostIds' | 'likedCommentIds' | 'favoriteGameIds'
  >, value: string) => {
    return update((current) => {
      const values = current[key]
      const nextValues = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value]
      return { ...current, [key]: nextValues }
    }, writeProgressState)
  }, [update])

  const value = useMemo<UserSystemContextValue>(() => ({
    state: entry.userId === userId ? entry.state : createDefaultUserSystemState(),
    updateLocalProfile: (profile) => update((current) => ({
      ...current,
      profile: { ...current.profile, ...profile },
    }), writeProfileState),
    toggleNotificationSetting: (key) => update((current) => ({
      ...current,
      notificationSettings: {
        ...current.notificationSettings,
        [key]: !current.notificationSettings[key],
      },
    }), writeSettingsState),
    markNotificationSectionRead: (section) => update((current) => ({
      ...current,
      readNotificationSections: current.readNotificationSections.includes(section)
        ? current.readNotificationSections
        : [...current.readNotificationSections, section],
    }), writeProgressState),
    setPrivacySetting: (key, enabled) => update((current) => ({
      ...current,
      privacySettings: { ...current.privacySettings, [key]: enabled },
    }), writeSettingsState),
    toggleFollowedUser: (id) => toggleListValue('followedUserIds', id),
    toggleBookmarkedPost: (id) => toggleListValue('bookmarkedPostIds', id),
    toggleLikedPost: (id) => toggleListValue('likedPostIds', id),
    toggleLikedComment: (id) => toggleListValue('likedCommentIds', id),
    toggleFavoriteGame: (id) => toggleListValue('favoriteGameIds', id),
    publishForumPost: (post) => update((current) => ({
      ...current,
      publishedPosts: [persistableForumPost(post), ...current.publishedPosts],
    }), writePublishedPostsState),
  }), [entry, toggleListValue, update, userId])

  return <UserSystemContext.Provider value={value}>{children}</UserSystemContext.Provider>
}

export function useUserSystem() {
  const context = useContext(UserSystemContext)
  if (!context) throw new Error('useUserSystem must be used inside <UserSystemProvider>')
  return context
}
