export type MetaFooterRoute =
  | 'discoverGames'
  | 'allGames'
  | 'tools'
  | 'forum'
  | 'notifications'
  | 'account'
  | 'publicProfile'
  // Landed on master while this branch was open. It is a content page, so it
  // takes the compact footer like its siblings.
  | 'platformUpdates'

export type MetaFooterKind = 'home' | 'compact'

export function resolveMetaFooterKind(view: MetaFooterRoute, isSignedIn: boolean): MetaFooterKind {
  if (view === 'discoverGames') return 'home'

  // Protected hashes fall back to the discovery page for signed-out visitors.
  if (!isSignedIn && (view === 'notifications' || view === 'account')) return 'home'

  return 'compact'
}
