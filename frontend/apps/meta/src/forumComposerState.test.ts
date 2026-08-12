import { describe, expect, it } from 'vitest'
import { isForumComposerDirty, type ForumComposerStateSnapshot } from './forumComposerState'

function composerState(
  overrides: Partial<ForumComposerStateSnapshot> = {},
): ForumComposerStateSnapshot {
  return {
    title: '',
    content: '',
    gameIds: [],
    topics: ['discussion'],
    customTags: [],
    gameQuery: '',
    tagQuery: '',
    videoUrl: '',
    videoInput: '',
    ...overrides,
  }
}

describe('forum composer dirty state', () => {
  it('treats a new composer with its route-provided game as unchanged', () => {
    expect(isForumComposerDirty(composerState(), null)).toBe(false)
    expect(isForumComposerDirty(composerState({ gameIds: ['aion2'] }), 'aion2')).toBe(false)
  })

  it.each([
    { title: 'Route notes' },
    { content: 'Unpublished details' },
    { gameIds: ['palworld'] },
    { topics: ['guide'] },
    { customTags: ['routes'] },
    { gameQuery: 'vrising' },
    { tagQuery: 'boss' },
    { videoUrl: 'https://www.bilibili.com/video/example' },
    { videoInput: 'https://v.douyin.com/example' },
  ])('detects an authored change in %o', (change) => {
    expect(isForumComposerDirty(composerState(change), null)).toBe(true)
  })

  it('detects removing the route-provided game', () => {
    expect(isForumComposerDirty(composerState(), 'aion2')).toBe(true)
  })
})
