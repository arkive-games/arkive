import { describe, expect, it } from 'vitest'

import type { CommentRead, PostRead, UserPublic } from '@gamemap/api-core'

import { calendarDate, composeTags, displayNumber, nestComments, toForumPost } from './forumModel'

const labels = {
  gameName: (id: string) => ({ palworld: 'Palworld', vrising: 'V Rising' })[id] ?? id,
  topicName: (topic: string) => ({ guide: 'Guide', question: 'Question' })[topic] ?? topic,
}

function user(overrides: Partial<UserPublic> = {}): UserPublic {
  return {
    name: 'Reader',
    uid: 10001,
    specialUid: null,
    avatarUrl: 'https://example.invalid/a.webp',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function post(overrides: Partial<PostRead> = {}): PostRead {
  return {
    postNo: 7,
    author: user(),
    channel: 'general',
    title: 'A title',
    body: 'A body',
    topic: null,
    gameIds: [],
    tags: [],
    commentCount: 0,
    likeCount: 0,
    bookmarkCount: 0,
    liked: false,
    bookmarked: false,
    images: [],
    videoUrl: null,
    featuredAt: null,
    createdAt: '2026-08-14T12:00:00Z',
    editedAt: null,
    ...overrides,
  }
}

function comment(overrides: Partial<CommentRead> = {}): CommentRead {
  return {
    id: 'c1',
    commentNo: 1,
    parentId: null,
    author: user(),
    body: 'A comment',
    likeCount: 0,
    liked: false,
    createdAt: '2026-08-14T12:00:00Z',
    editedAt: null,
    ...overrides,
  }
}

describe('displayNumber', () => {
  it('prefers the vanity number when the account has one', () => {
    expect(displayNumber(user({ uid: 10042, specialUid: 42 }))).toBe('42')
  })

  it('falls back to the permanent uid', () => {
    expect(displayNumber(user({ uid: 10042, specialUid: null }))).toBe('10042')
  })
})

describe('composeTags', () => {
  it('puts games first, then the topic, then free-form tags', () => {
    expect(
      composeTags({ gameIds: ['palworld'], topic: 'guide', tags: ['breeding'] }, labels),
    ).toEqual(['Palworld', 'Guide', 'breeding'])
  })

  it('drops a free-form tag that duplicates the topic label', () => {
    // The label is the React key for the tag row, so a duplicate was a
    // console warning as well as the same word printed twice.
    expect(composeTags({ gameIds: [], topic: 'guide', tags: ['Guide'] }, labels)).toEqual(['Guide'])
  })

  it('ignores blank tags rather than rendering an empty chip', () => {
    expect(composeTags({ gameIds: [], topic: null, tags: ['  ', 'real'] }, labels)).toEqual(['real'])
  })
})

describe('toForumPost', () => {
  it('marks a post as the reader own only when the uids match', () => {
    const mine = toForumPost(post({ author: user({ uid: 500 }) }), labels, 500)
    expect(mine.own).toBe(true)

    const theirs = toForumPost(post({ author: user({ uid: 500 }) }), labels, 501)
    expect(theirs.own).toBe(false)
  })

  it('does not treat a shared display name as ownership', () => {
    // Names are neither unique nor stable. Comparing them would hand one
    // account the edit control on another account's post.
    const other = toForumPost(post({ author: user({ uid: 900, name: 'Reader' }) }), labels, 901)
    expect(other.own).toBe(false)
  })

  it('is never own for a signed-out reader', () => {
    expect(toForumPost(post(), labels, null).own).toBe(false)
  })

  it('reads featured from the timestamp rather than a flag', () => {
    expect(toForumPost(post({ featuredAt: null }), labels, null).featured).toBe(false)
    expect(toForumPost(post({ featuredAt: '2026-08-01T00:00:00Z' }), labels, null).featured).toBe(true)
  })

  it('links by the permanent uid, not the reassignable vanity number', () => {
    const mapped = toForumPost(post({ author: user({ uid: 10042, specialUid: 42 }) }), labels, null)
    expect(mapped.authorUid).toBe('10042')
    expect(mapped.authorNumber).toBe('42')
  })
})

describe('calendarDate', () => {
  it('formats in the reader own timezone rather than slicing the UTC string', () => {
    // 23:30 UTC is already the next day east of Greenwich. Slicing the ISO
    // string shows every Chinese reader yesterday's date for eight hours a day.
    const value = '2026-08-14T23:30:00Z'
    const expected = new Date(value)
    const wanted = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`
    expect(calendarDate(value)).toBe(wanted)
  })

  it('returns an empty string for an unparseable value rather than NaN-NaN-NaN', () => {
    expect(calendarDate('not a date')).toBe('')
  })
})

describe('nestComments', () => {
  it('attaches a reply to its parent', () => {
    const roots = nestComments(
      [comment({ id: 'a' }), comment({ id: 'b', commentNo: null, parentId: 'a' })],
      null,
    )
    expect(roots).toHaveLength(1)
    expect(roots[0].replies.map((r) => r.id)).toEqual(['b'])
  })

  it('flattens a reply-to-a-reply onto the top-level ancestor', () => {
    // Two levels is what the thread renders; a third would be an unbounded
    // ladder that a phone cannot show.
    const roots = nestComments(
      [
        comment({ id: 'a' }),
        comment({ id: 'b', commentNo: null, parentId: 'a' }),
        comment({ id: 'c', commentNo: null, parentId: 'b' }),
      ],
      null,
    )
    expect(roots).toHaveLength(1)
    expect(roots[0].replies.map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('keeps a reply whose parent is not on this page rather than dropping it', () => {
    // Losing a comment silently is worse than showing it at the wrong level.
    const roots = nestComments([comment({ id: 'b', commentNo: null, parentId: 'missing' })], null)
    expect(roots.map((r) => r.id)).toEqual(['b'])
  })

  it('terminates on a parent cycle the server should never emit', () => {
    const roots = nestComments(
      [
        comment({ id: 'a', commentNo: null, parentId: 'b' }),
        comment({ id: 'b', commentNo: null, parentId: 'a' }),
      ],
      null,
    )
    expect(roots.length).toBeGreaterThan(0)
  })

  it('marks own comments by uid', () => {
    const roots = nestComments([comment({ author: user({ uid: 77 }) })], 77)
    expect(roots[0].own).toBe(true)
  })
})

describe('nestComments and the truncation notice', () => {
  it('returns roots only, so its length is not the number of comments loaded', () => {
    // The defect this pins: the detail view compared the server's total (which
    // counts replies) against the length of this tree (which does not), so a
    // thread of two comments and one reply rendered all three and then said one
    // more was hidden. Every thread with a reply announced a phantom comment.
    const rows = [
      comment({ id: 'a', commentNo: 1 }),
      comment({ id: 'b', commentNo: 2 }),
      comment({ id: 'r', commentNo: null, parentId: 'a' }),
    ]
    const roots = nestComments(rows, null)

    expect(roots).toHaveLength(2)
    expect(rows).toHaveLength(3)
    // What the notice must compare against is the flat count, which equals the
    // total here — so nothing is hidden and no notice should appear.
    const loaded = rows.length
    const total = 3
    expect(total > loaded).toBe(false)
    // Whereas the old comparison would have claimed one more comment existed.
    expect(total > roots.length).toBe(true)
  })
})
