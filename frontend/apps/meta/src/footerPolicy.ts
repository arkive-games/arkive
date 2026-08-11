export type MetaFooterRoute =
  | 'discoverGames'
  | 'allGames'
  | 'forum'
  | 'notifications'
  | 'account'
  | 'publicProfile'

export type MetaFooterKind = 'home' | 'compact'

export function resolveMetaFooterKind(view: MetaFooterRoute, isSignedIn: boolean): MetaFooterKind {
  if (view === 'discoverGames') return 'home'

  // Protected hashes fall back to the discovery page for signed-out visitors.
  if (!isSignedIn && (view === 'notifications' || view === 'account')) return 'home'

  return 'compact'
}
