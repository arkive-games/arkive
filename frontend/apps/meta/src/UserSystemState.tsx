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
import { MemoryClient, browserMemory, defineMemoryRecord, parseJson, type StorageLike } from '@gamemap/state-memory'
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
  topic: string
  imageSrc: string | null
  videoUrl: string | null
  createdAt: string
}

export interface UserSystemState {
  profile: {
    bio: string
    avatarSrc: string | null
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
  publishForumPost: (post: LocalForumPost) => void
}

const STORAGE_PREFIX = 'arkive.meta.user-system.v1'

export function createDefaultUserSystemState(): UserSystemState {
  return {
    profile: { bio: '', avatarSrc: DEFAULT_AVATAR_SRC },
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
  return value.filter((item): item is LocalForumPost => {
    if (!item || typeof item !== 'object') return false
    const post = item as Partial<LocalForumPost>
    return typeof post.id === 'string'
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
  })
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
    && Boolean(state.notificationSettings)
    && Boolean(state.privacySettings)
    && [state.readNotificationSections, state.followedUserIds, state.bookmarkedPostIds,
      state.likedPostIds, state.likedCommentIds, state.favoriteGameIds, state.publishedPosts]
      .every(Array.isArray)
}

function userSystemRecord(userId: string) {
  return defineMemoryRecord({
    id: 'state', namespace: 'site', surface: 'user-system', stateClass: 'durable_progress',
    schemaVersion: '1.0.0', defaultValue: createDefaultUserSystemState,
    validate: isUserSystemState, accountScoped: true,
    legacyKeys: [storageKey(userId)],
    migrateLegacy: (raw: string) => normalizeUserSystemState(parseJson(raw)),
  })
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
  return new MemoryClient({ deviceStorage: adapter }).read(userSystemRecord(userId), { accountId: userId })
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
  new MemoryClient({ deviceStorage: adapter }).write(userSystemRecord(userId), state, { accountId: userId })
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

  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== userId) {
      browserMemory.clearAccount(previousUserId.current)
    }
    previousUserId.current = userId
    setEntry({
      userId,
      state: userId
        ? browserMemory.read(userSystemRecord(userId), { accountId: userId })
        : createDefaultUserSystemState(),
    })
  }, [userId])

  const update = useCallback((mutate: (current: UserSystemState) => UserSystemState) => {
    if (!userId) return
    setEntry((currentEntry) => {
      const current = currentEntry.userId === userId
        ? currentEntry.state
        : browserMemory.read(userSystemRecord(userId), { accountId: userId })
      const next = mutate(current)
      browserMemory.write(userSystemRecord(userId), next, { accountId: userId })
      return { userId, state: next }
    })
  }, [userId])

  const toggleListValue = useCallback((key: keyof Pick<
    UserSystemState,
    'followedUserIds' | 'bookmarkedPostIds' | 'likedPostIds' | 'likedCommentIds' | 'favoriteGameIds'
  >, value: string) => {
    update((current) => {
      const values = current[key]
      const nextValues = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value]
      return { ...current, [key]: nextValues }
    })
  }, [update])

  const value = useMemo<UserSystemContextValue>(() => ({
    state: entry.userId === userId ? entry.state : createDefaultUserSystemState(),
    updateLocalProfile: (profile) => update((current) => ({
      ...current,
      profile: { ...current.profile, ...profile },
    })),
    toggleNotificationSetting: (key) => update((current) => ({
      ...current,
      notificationSettings: {
        ...current.notificationSettings,
        [key]: !current.notificationSettings[key],
      },
    })),
    markNotificationSectionRead: (section) => update((current) => ({
      ...current,
      readNotificationSections: current.readNotificationSections.includes(section)
        ? current.readNotificationSections
        : [...current.readNotificationSections, section],
    })),
    setPrivacySetting: (key, enabled) => update((current) => ({
      ...current,
      privacySettings: { ...current.privacySettings, [key]: enabled },
    })),
    toggleFollowedUser: (id) => toggleListValue('followedUserIds', id),
    toggleBookmarkedPost: (id) => toggleListValue('bookmarkedPostIds', id),
    toggleLikedPost: (id) => toggleListValue('likedPostIds', id),
    toggleLikedComment: (id) => toggleListValue('likedCommentIds', id),
    toggleFavoriteGame: (id) => toggleListValue('favoriteGameIds', id),
    publishForumPost: (post) => update((current) => ({
      ...current,
      publishedPosts: [post, ...current.publishedPosts],
    })),
  }), [entry, toggleListValue, update, userId])

  return <UserSystemContext.Provider value={value}>{children}</UserSystemContext.Provider>
}

export function useUserSystem() {
  const context = useContext(UserSystemContext)
  if (!context) throw new Error('useUserSystem must be used inside <UserSystemProvider>')
  return context
}
