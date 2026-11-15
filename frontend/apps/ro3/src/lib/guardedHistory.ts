const INDEX_KEY = 'ro3NavigationIndex'
function historyIndex(state: unknown): number | undefined {
  if (!state || typeof state !== 'object') return
  const index = (state as Record<string, unknown>)[INDEX_KEY]
  return Number.isSafeInteger(index) ? index as number : undefined
}

/** Undo a refused traversal by returning to its original entry, not by adding history. */
export function guardedHistory(target: Pick<Window, 'history' | 'addEventListener' | 'removeEventListener'>, allow: () => boolean, adopt: () => void, request?: (leave: () => void) => void) {
  const history = target.history
  let index = historyIndex(history.state) ?? 0
  let restoring: number | null = null
  let afterRestore: (() => void) | undefined
  let approved: number | undefined
  history.replaceState({ ...history.state, [INDEX_KEY]: index }, '')
  const onPop = () => {
    const next = historyIndex(history.state)
    if (restoring !== null && next === restoring) {
      restoring = null
      const ask = afterRestore
      afterRestore = undefined
      ask?.()
      return
    }
    // Entries outside this SPA's navigation have no index; ordinary document exits
    // remain protected by beforeunload rather than an invented history offset.
    if (next === undefined) {
      index++
      history.replaceState({ ...history.state, [INDEX_KEY]: index }, '')
      adopt()
      return
    }
    if (next !== index && next !== approved && !allow()) {
      const delta = next - index
      afterRestore = request ? () => request(() => { approved = next; history.go(delta) }) : undefined
      restoring = index
      history.go(index - next)
      return
    }
    restoring = null
    approved = undefined
    index = next
    adopt()
  }
  target.addEventListener('popstate', onPop)
  return {
    push(url: string): boolean {
      if (restoring !== null) return false
      index++
      history.pushState({ [INDEX_KEY]: index }, '', url)
      return true
    },
    dispose() { target.removeEventListener('popstate', onPop) },
  }
}
