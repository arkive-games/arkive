import { describe, expect, it } from 'vitest'
import { resolveMetaFooterKind, type MetaFooterRoute } from './footerPolicy'

describe('resolveMetaFooterKind', () => {
  it('uses the large footer only for the rendered discovery home', () => {
    expect(resolveMetaFooterKind('discoverGames', false)).toBe('home')
    expect(resolveMetaFooterKind('notifications', false)).toBe('home')
    expect(resolveMetaFooterKind('account', false)).toBe('home')
  })

  it.each<MetaFooterRoute>([
    'allGames', 'forum', 'notifications', 'account', 'publicProfile', 'platformUpdates',
  ])(
    'uses the compact footer for the %s page',
    (view) => {
      expect(resolveMetaFooterKind(view, true)).toBe('compact')
    },
  )
})
