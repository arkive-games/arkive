import { describe, expect, it } from 'vitest'
import {
  createDefaultUserSystemState,
  readUserSystemState,
  writeUserSystemState,
} from './UserSystemState'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('user system state persistence', () => {
  it('keeps data isolated by authenticated user id', () => {
    const storage = memoryStorage()
    const first = createDefaultUserSystemState()
    first.profile.bio = 'First profile'
    first.bookmarkedPostIds = ['vrising-routes']
    writeUserSystemState(storage, 'user-a', first)

    expect(readUserSystemState(storage, 'user-a')).toMatchObject(first)
    expect(readUserSystemState(storage, 'user-b')).toEqual(createDefaultUserSystemState())
  })

  it('repairs malformed and partial saved state with current defaults', () => {
    const storage = memoryStorage()
    storage.setItem('arkive.meta.user-system.v1:user-a', JSON.stringify({
      profile: { bio: 'Saved bio' },
      notificationSettings: { browser: true },
      followedUserIds: ['known-user', 42],
    }))

    const state = readUserSystemState(storage, 'user-a')
    expect(state.profile).toEqual({ bio: 'Saved bio', avatarSrc: DEFAULT_AVATAR_SRC })
    expect(state.notificationSettings.replies).toBe(true)
    expect(state.notificationSettings.browser).toBe(true)
    expect(state.followedUserIds).toEqual(['known-user'])
  })

  it('assigns the first Arkive preset to a new account', () => {
    expect(createDefaultUserSystemState().profile.avatarSrc).toBe(DEFAULT_AVATAR_SRC)
  })

  it('falls back safely when saved JSON is invalid', () => {
    const storage = memoryStorage()
    storage.setItem('arkive.meta.user-system.v1:user-a', '{invalid')
    expect(readUserSystemState(storage, 'user-a')).toEqual(createDefaultUserSystemState())
  })

  it('restores valid authored posts and drops malformed entries', () => {
    const storage = memoryStorage()
    storage.setItem('arkive.meta.user-system.v1:user-a', JSON.stringify({
      publishedPosts: [
        {
          id: 'local-1',
          title: 'A route note',
          content: 'Useful route details.',
          channel: 'games',
          gameId: 'vrising',
          topic: 'guide',
          imageSrc: null,
          videoUrl: null,
          createdAt: '2026-08-09T00:00:00.000Z',
        },
        { id: 42, title: 'Invalid' },
      ],
    }))

    const posts = readUserSystemState(storage, 'user-a').publishedPosts
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      id: 'local-1',
      gameIds: ['vrising'],
      topics: ['guide'],
      tags: [],
      imageSrcs: [],
    })
  })

  it('restores authored posts with multiple games, tags, and images', () => {
    const storage = memoryStorage()
    storage.setItem('arkive.meta.user-system.v1:user-a', JSON.stringify({
      publishedPosts: [{
        id: 'local-2',
        title: 'Cross-game route notes',
        content: 'Useful route details for two games.',
        channel: 'games',
        gameId: 'aion2',
        gameIds: ['aion2', 'palworld'],
        topic: 'guide',
        topics: ['guide', 'testing'],
        tags: ['route'],
        imageSrc: 'data:image/png;base64,first',
        imageSrcs: ['data:image/png;base64,first', 'data:image/png;base64,second'],
        videoUrl: 'https://www.bilibili.com/video/BV1xxxxxx',
        createdAt: '2026-08-10T00:00:00.000Z',
      }],
    }))

    expect(readUserSystemState(storage, 'user-a').publishedPosts[0]).toMatchObject({
      gameIds: ['aion2', 'palworld'],
      topics: ['guide', 'testing'],
      tags: ['route'],
      imageSrcs: ['data:image/png;base64,first', 'data:image/png;base64,second'],
    })
  })
})
