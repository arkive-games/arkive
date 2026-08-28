export type GuideScope = 'all' | 'class' | 'dungeon'
export type GuideSort = 'latest' | 'saved' | 'replied'

export interface GuideAuthor {
  id: string
  name: string
  avatarUrl?: string
}

export interface GuideEntry {
  id: string
  scope: Exclude<GuideScope, 'all'>
  title: string
  summary: string
  classId?: string
  dungeonId?: string
  tags: string[]
  author: GuideAuthor
  updatedAt: string
  savedCount: number
  replyCount: number
  href: string
  coverUrl?: string
}

export interface GuideFilters {
  scope: GuideScope
  classId: string
  dungeonId: string
  query: string
  sort: GuideSort
}

export function filterGuides(guides: readonly GuideEntry[], filters: GuideFilters): GuideEntry[] {
  const query = filters.query.trim().toLocaleLowerCase()

  return [...guides]
    .filter((guide) => filters.scope === 'all' || guide.scope === filters.scope)
    .filter((guide) => !filters.classId || guide.classId === filters.classId)
    .filter((guide) => !filters.dungeonId || guide.dungeonId === filters.dungeonId)
    .filter((guide) => {
      if (!query) return true
      return [guide.title, guide.summary, guide.author.name, ...guide.tags]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    })
    .sort((left, right) => {
      if (filters.sort === 'saved') return right.savedCount - left.savedCount
      if (filters.sort === 'replied') return right.replyCount - left.replyCount
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    })
}
