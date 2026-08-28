import { describe, expect, it } from 'vitest'
import { filterGuides, type GuideEntry } from './guideCatalog'

const guides: GuideEntry[] = [
  {
    id: 'swordsman-one',
    scope: 'class',
    title: 'Swordsman route one',
    summary: 'First player route',
    classId: 'swordsman',
    tags: ['tank'],
    author: { id: 'author-one', name: 'Author One' },
    updatedAt: '2026-08-11T08:00:00Z',
    savedCount: 12,
    replyCount: 3,
    href: '/guides/swordsman-one',
  },
  {
    id: 'swordsman-two',
    scope: 'class',
    title: 'Swordsman route two',
    summary: 'Second player route',
    classId: 'swordsman',
    tags: ['damage'],
    author: { id: 'author-two', name: 'Author Two' },
    updatedAt: '2026-08-12T08:00:00Z',
    savedCount: 8,
    replyCount: 7,
    href: '/guides/swordsman-two',
  },
  {
    id: 'dungeon-one',
    scope: 'dungeon',
    title: 'Dungeon route one',
    summary: 'First party route',
    dungeonId: 'echoing-corridor',
    tags: ['party'],
    author: { id: 'author-three', name: 'Author Three' },
    updatedAt: '2026-08-09T08:00:00Z',
    savedCount: 24,
    replyCount: 2,
    href: '/guides/dungeon-one',
  },
  {
    id: 'dungeon-two',
    scope: 'dungeon',
    title: 'Dungeon route two',
    summary: 'Second party route',
    dungeonId: 'echoing-corridor',
    tags: ['party'],
    author: { id: 'author-four', name: 'Author Four' },
    updatedAt: '2026-08-10T08:00:00Z',
    savedCount: 18,
    replyCount: 9,
    href: '/guides/dungeon-two',
  },
]

describe('guide catalog filters', () => {
  it('keeps multiple authors and articles for the same class', () => {
    const result = filterGuides(guides, {
      scope: 'class',
      classId: 'swordsman',
      dungeonId: '',
      query: '',
      sort: 'latest',
    })

    expect(result.map((guide) => guide.id)).toEqual(['swordsman-two', 'swordsman-one'])
    expect(new Set(result.map((guide) => guide.author.id))).toHaveLength(2)
  })

  it('keeps multiple authors and articles for the same dungeon', () => {
    const result = filterGuides(guides, {
      scope: 'dungeon',
      classId: '',
      dungeonId: 'echoing-corridor',
      query: '',
      sort: 'replied',
    })

    expect(result.map((guide) => guide.id)).toEqual(['dungeon-two', 'dungeon-one'])
    expect(new Set(result.map((guide) => guide.author.id))).toHaveLength(2)
  })

  it('searches article and author fields without collapsing results', () => {
    const result = filterGuides(guides, {
      scope: 'all',
      classId: '',
      dungeonId: '',
      query: 'author',
      sort: 'saved',
    })

    expect(result).toHaveLength(4)
    expect(result[0]?.id).toBe('dungeon-one')
  })
})
