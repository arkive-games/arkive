import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@gamemap/auth'
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
      && typeof post.createdAt === 'string'
  })
}

export function readUserSystemState(storage: Pick<Storage, 'getItem'>, userId: string): UserSystemState {
  const defaults = createDefaultUserSystemState()
  try {
    const raw = storage.getItem(storageKey(userId))
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<UserSystemState>
    return {
      profile: {
        bio: typeof parsed.profile?.bio === 'string' ? parsed.profile.bio : defaults.profile.bio,
        avatarSrc: typeof parsed.profile?.avatarSrc === 'string' && parsed.profile.avatarSrc
          ? parsed.profile.avatarSrc
          : defaults.profile.avatarSrc,
      },
      notificationSettings: { ...defaults.notificationSettings, ...parsed.notificationSettings },
      readNotificationSections: stringArray(parsed.readNotificationSections)
        .filter((section): section is NotificationInboxSection => ['replies', 'mentions', 'likes', 'system'].includes(section)),
      privacySettings: { ...defaults.privacySettings, ...parsed.privacySettings },
      followedUserIds: stringArray(parsed.followedUserIds),
      bookmarkedPostIds: stringArray(parsed.bookmarkedPostIds),
      likedPostIds: stringArray(parsed.likedPostIds),
      likedCommentIds: stringArray(parsed.likedCommentIds),
      favoriteGameIds: stringArray(parsed.favoriteGameIds),
      publishedPosts: localForumPosts(parsed.publishedPosts),
    }
  } catch {
    return defaults
  }
}

export function writeUserSystemState(
  storage: Pick<Storage, 'setItem'>,
  userId: string,
  state: UserSystemState,
) {
  storage.setItem(storageKey(userId), JSON.stringify(state))
}

const UserSystemContext = createContext<UserSystemContextValue | null>(null)

export function UserSystemProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [entry, setEntry] = useState<{ userId: string | null; state: UserSystemState }>(() => ({
    userId: null,
    state: createDefaultUserSystemState(),
  }))

  useEffect(() => {
    setEntry({
      userId,
      state: userId ? readUserSystemState(window.localStorage, userId) : createDefaultUserSystemState(),
    })
  }, [userId])

  const update = useCallback((mutate: (current: UserSystemState) => UserSystemState) => {
    if (!userId) return
    setEntry((currentEntry) => {
      const current = currentEntry.userId === userId
        ? currentEntry.state
        : readUserSystemState(window.localStorage, userId)
      const next = mutate(current)
      try {
        writeUserSystemState(window.localStorage, userId, next)
      } catch {
        // Keep the current session functional when storage is unavailable or full.
      }
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
