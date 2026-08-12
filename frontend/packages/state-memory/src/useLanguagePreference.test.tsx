// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryClient, type StorageLike } from './core'
import { useLanguagePreference, type LanguagePreferenceControls } from './react'

afterEach(cleanup)

function storage(): StorageLike {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
}

const SUPPORTED = ['en-US', 'zh-CN', 'ja-JP'] as const

function mount() {
  const client = new MemoryClient({ deviceStorage: storage(), sharedStorage: storage() })
  const apply = vi.fn()
  let controls!: LanguagePreferenceControls<(typeof SUPPORTED)[number]>

  function Probe() {
    controls = useLanguagePreference(SUPPORTED, 'en-US', apply, client)
    return null
  }
  render(<Probe />)

  return { apply, get: () => controls }
}

describe('useLanguagePreference', () => {
  it('keeps General on the inherited value when only this site has been set', () => {
    const probe = mount()

    // The reachable state: a first-time visitor opens Settings and sets only the
    // per-game row. The panel does not seed, so nothing shared exists yet.
    act(() => { probe.get().setOverride('ja-JP') })

    expect(probe.get().override).toBe('ja-JP')
    // General must report what this site would show WITHOUT its override -- it
    // describes the other Arkive sites, which are still on browser detection.
    // Reporting the override here states something false about them, and makes
    // "Follow general" switch to a language the row never displayed.
    expect(probe.get().generalValue).toBe('en-US')
  })

  it('switches to exactly the value General showed when the override is dropped', () => {
    const probe = mount()
    act(() => { probe.get().setOverride('ja-JP') })
    const shownAsGeneral = probe.get().generalValue

    act(() => { probe.get().followGeneral() })

    expect(probe.apply).toHaveBeenLastCalledWith(shownAsGeneral)
  })

  it('reports the shared value as General once one exists', () => {
    const probe = mount()
    act(() => { probe.get().setGeneral('zh-CN') })

    expect(probe.get().generalValue).toBe('zh-CN')
    expect(probe.get().override).toBeNull()
  })

  it('leaves the page alone when General changes under an override', () => {
    const probe = mount()
    act(() => { probe.get().setOverride('ja-JP') })

    act(() => { probe.get().setGeneral('zh-CN') })

    expect(probe.get().generalValue).toBe('zh-CN')
    // Still Japanese: a site that opted out of the shared value must not move.
    expect(probe.apply).toHaveBeenLastCalledWith('ja-JP')
  })
})
