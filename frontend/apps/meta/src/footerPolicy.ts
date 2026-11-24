export type MetaFooterRoute =
  | 'discoverGames'
  | 'allGames'
  | 'tools'
  | 'forum'
  | 'notifications'
  | 'account'
  | 'moderation'
  | 'publicProfile'
  | 'platformUpdates'
  | 'glimmithTutorial'

export type MetaFooterKind = 'home' | 'compact'

export function resolveMetaFooterKind(view: MetaFooterRoute, isSignedIn: boolean): MetaFooterKind {
  if (view === 'discoverGames' || view === 'platformUpdates') return 'home'

  // Protected hashes fall back to the discovery page for signed-out visitors.
  if (!isSignedIn && (view === 'notifications' || view === 'account')) return 'home'

  return 'compact'
}
