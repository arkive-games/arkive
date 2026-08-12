import { describe, expect, it } from 'vitest'
import {
  createDefaultUserSystemState,
  readUserSystemState,
  writeUserSystemState,
} from './UserSystemState'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'

function memoryStorage(refuseWrite?: (key: string) => boolean) {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (refuseWrite?.(key)) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      values.set(key, value)
    },
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

  it('migrates a legacy post that predates imageSrcs without throwing', () => {
    const storage = memoryStorage()
    // The shape older builds wrote: `imageSrc` and no `imageSrcs`. The legacy
    // record's validator only checks Array.isArray(publishedPosts), so this
    // reaches the migration, where mapping straight into persistableForumPost
    // read `.imageSrcs.filter` off undefined -- thrown inside the provider
    // effect, so the page went white AND the legacy record was never cleared,
    // repeating on every load.
    storage.setItem('arkive.meta.user-system.v1:user-a', JSON.stringify({
      publishedPosts: [{
        id: 'p1',
        title: 'Old post',
        content: 'body',
        channel: 'general',
        gameId: null,
        topic: 'guides',
        imageSrc: 'https://example.test/a.png',
        videoUrl: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    }))

    const state = readUserSystemState(storage, 'user-a')
    expect(state.publishedPosts).toHaveLength(1)
    expect(state.publishedPosts[0].imageSrcs).toEqual(['https://example.test/a.png'])
    expect(state.publishedPosts[0].imageSrc).toBe('https://example.test/a.png')
  })

  it('drops a non-object entry in a legacy post list instead of throwing', () => {
    const storage = memoryStorage()
    storage.setItem('arkive.meta.user-system.v1:user-a', JSON.stringify({
      publishedPosts: [null, 'not-a-post', 7],
    }))

    expect(readUserSystemState(storage, 'user-a').publishedPosts).toEqual([])
  })

  it('repairs malformed and partial saved state with current defaults', () => {
    const storage = memoryStorage()
    storage.setItem('arkive.meta.user-system.v1:user-a', JSON.stringify({
      profile: { bio: 'Saved bio' },
      notificationSettings: { browser: true },
      followedUserIds: ['known-user', 42],
    }))

    const state = readUserSystemState(storage, 'user-a')
    expect(state.profile).toEqual({ bio: 'Saved bio', avatarSrc: DEFAULT_AVATAR_SRC, gender: 'female' })
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

  it('restores authored posts without carrying legacy image bytes forward', () => {
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
      imageSrc: null,
      imageSrcs: [],
    })
  })

  it('stores post metadata separately and removes local image bytes', () => {
    const storage = memoryStorage()
    const state = createDefaultUserSystemState()
    state.likedPostIds = ['guide-1']
    state.publishedPosts = [{
      id: 'local-large-image',
      title: 'Screenshot route',
      content: 'A route with a local screenshot attached.',
      channel: 'games',
      gameId: 'palworld',
      gameIds: ['palworld'],
      topic: 'guide',
      topics: ['guide'],
      tags: [],
      imageSrc: `data:image/png;base64,${'a'.repeat(1_400_000)}`,
      imageSrcs: [`data:image/png;base64,${'a'.repeat(1_400_000)}`],
      videoUrl: null,
      createdAt: '2026-08-11T00:00:00.000Z',
    }]

    expect(writeUserSystemState(storage, 'user-a', state)).toBe(true)
    expect(readUserSystemState(storage, 'user-a')).toMatchObject({
      likedPostIds: ['guide-1'],
      publishedPosts: [{ imageSrc: null, imageSrcs: [] }],
    })
  })

  it('keeps progress durable when the authored-post record refuses a write', () => {
    const storage = memoryStorage((key) => key.includes('.user-system.authored-posts.'))
    const state = createDefaultUserSystemState()
    state.bookmarkedPostIds = ['post-1']
    state.favoriteGameIds = ['vrising']
    state.publishedPosts = [{
      id: 'local-1',
      title: 'A route note',
      content: 'Useful route details.',
      channel: 'games',
      gameId: 'vrising',
      gameIds: ['vrising'],
      topic: 'guide',
      topics: ['guide'],
      tags: [],
      imageSrc: null,
      imageSrcs: [],
      videoUrl: null,
      createdAt: '2026-08-11T00:00:00.000Z',
    }]

    expect(writeUserSystemState(storage, 'user-a', state)).toBe(false)
    expect(readUserSystemState(storage, 'user-a')).toMatchObject({
      bookmarkedPostIds: ['post-1'],
      favoriteGameIds: ['vrising'],
      publishedPosts: [],
    })
  })
})
