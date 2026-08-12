export interface ForumComposerStateSnapshot {
  title: string
  content: string
  gameIds: readonly string[]
  topics: readonly string[]
  customTags: readonly string[]
  gameQuery: string
  tagQuery: string
  videoUrl: string
  videoInput: string
}

function matches(values: readonly string[], expected: readonly string[]) {
  return values.length === expected.length
    && values.every((value, index) => value === expected[index])
}

export function isForumComposerDirty(
  state: ForumComposerStateSnapshot,
  initialGameId: string | null,
) {
  const initialGameIds = initialGameId ? [initialGameId] : []

  return state.title.length > 0
    || state.content.length > 0
    || !matches(state.gameIds, initialGameIds)
    || !matches(state.topics, ['discussion'])
    || state.customTags.length > 0
    || state.gameQuery.length > 0
    || state.tagQuery.length > 0
    || state.videoUrl.length > 0
    || state.videoInput.length > 0
}
