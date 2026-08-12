import { describe, expect, it } from 'vitest'
import {
  createLayeredPreference,
  resolvePreferenceLayers,
  type PreferenceLayerStore,
} from './preferences'

/** An in-memory pair of layers, standing in for a cookie plus device storage. */
function store(initial: { global?: string | null; override?: string | null } = {}) {
  const state = {
    global: initial.global ?? null,
    override: initial.override ?? null,
  }
  const api: PreferenceLayerStore<string> = {
    readGlobal: () => state.global,
    writeGlobal: (value) => { state.global = value },
    readOverride: () => state.override,
    writeOverride: (value) => { state.override = value },
    clearOverride: () => { state.override = null },
  }
  return { state, api }
}

describe('resolvePreferenceLayers', () => {
  it('prefers the override, then the shared value, then the fallback', () => {
    expect(resolvePreferenceLayers('zh-CN', 'ja-JP', 'en-US').effective).toBe('ja-JP')
    expect(resolvePreferenceLayers('zh-CN', null, 'en-US').effective).toBe('zh-CN')
    expect(resolvePreferenceLayers(null, null, 'en-US').effective).toBe('en-US')
  })
})

describe('createLayeredPreference', () => {
  it('seeds the shared value the first time a site control writes', () => {
    const { state, api } = store()
    createLayeredPreference(api, () => 'en-US').setFromSiteControl('zh-CN')

    // Both layers: the override is what this site now uses, and the shared value
    // is what the OTHER sites inherit -- which is the half that is easy to drop.
    expect(state).toEqual({ global: 'zh-CN', override: 'zh-CN' })
  })

  it('leaves an existing shared value alone on later site writes', () => {
    const { state, api } = store({ global: 'zh-CN', override: 'zh-CN' })
    createLayeredPreference(api, () => 'en-US').setFromSiteControl('ja-JP')

    expect(state).toEqual({ global: 'zh-CN', override: 'ja-JP' })
  })

  it('seeds even when the site already overrides but nothing shared exists', () => {
    // Reachable by setting an override in the panel before anything else: the
    // panel does not seed, so the next top-bar write is still the first one.
    const { state, api } = store({ global: null, override: 'ja-JP' })
    createLayeredPreference(api, () => 'en-US').setFromSiteControl('ko-KR')

    expect(state).toEqual({ global: 'ko-KR', override: 'ko-KR' })
  })

  it('does not touch the override when the shared value is set directly', () => {
    const { state, api } = store({ global: 'zh-CN', override: 'ja-JP' })
    const preference = createLayeredPreference(api, () => 'en-US')
    preference.setGlobal('ko-KR')

    expect(state).toEqual({ global: 'ko-KR', override: 'ja-JP' })
    // Still Japanese on this site: changing General must not move a site that
    // has deliberately opted out of it.
    expect(preference.read().effective).toBe('ja-JP')
  })

  it('falls back to the shared value once the override is cleared', () => {
    const { api } = store({ global: 'zh-CN', override: 'ja-JP' })
    const preference = createLayeredPreference(api, () => 'en-US')
    preference.clearOverride()

    expect(preference.read()).toEqual({
      global: 'zh-CN',
      override: null,
      effective: 'zh-CN',
      inherited: 'en-US',
    })
  })

  it('reports the fallback as effective while both layers are empty', () => {
    const { api } = store()
    expect(createLayeredPreference(api, () => 'en-US').read()).toEqual({
      global: null,
      override: null,
      effective: 'en-US',
      inherited: 'en-US',
    })
  })
})
