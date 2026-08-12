// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArkiveSettingsPanel, type ArkiveSettingsPanelProps } from './ArkiveSettingsPanel'
import { localDataStringsFor } from './LocalDataControls'
import { settingsStringsFor } from './settingsStrings'

afterEach(cleanup)

const THEME_OPTIONS = [
  { value: 'auto' as const, label: 'Auto' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
]

const LANGUAGE_OPTIONS = [
  { code: 'en-US', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'ja-JP', label: '日本語' },
]

/** React sets a select's value as a DOM property, so the attribute is absent. */
function selectValue(testId: string): string {
  return (screen.getByTestId(testId) as HTMLSelectElement).value
}

function panel(overrides: Partial<ArkiveSettingsPanelProps> = {}) {
  const props: ArkiveSettingsPanelProps = {
    strings: settingsStringsFor('en-US'),
    localData: localDataStringsFor('en-US'),
    site: { name: 'Palworld' },
    theme: {
      options: THEME_OPTIONS,
      generalValue: 'auto',
      override: null,
      onSetGeneral: vi.fn(),
      onSetOverride: vi.fn(),
      onFollowGeneral: vi.fn(),
    },
    language: {
      options: LANGUAGE_OPTIONS,
      generalValue: 'zh-CN',
      override: null,
      onSetGeneral: vi.fn(),
      onSetOverride: vi.fn(),
      onFollowGeneral: vi.fn(),
    },
    ...overrides,
  }
  render(<ArkiveSettingsPanel {...props} />)
  return props
}

describe('ArkiveSettingsPanel', () => {
  it('shows both layers at once, so an override is legible without a click', () => {
    panel({
      language: {
        options: LANGUAGE_OPTIONS,
        generalValue: 'zh-CN',
        override: 'ja-JP',
        onSetGeneral: vi.fn(),
        onSetOverride: vi.fn(),
        onFollowGeneral: vi.fn(),
      },
    })

    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.getByText('Palworld only')).toBeTruthy()
    // General still reads zh-CN while this site reads ja-JP.
    expect(selectValue('settings-general-language')).toBe('zh-CN')
    expect(selectValue('settings-site-language')).toBe('ja-JP')
    expect(screen.getByText('Overriding general')).toBeTruthy()
  })

  it('names the value a following site inherits, rather than only saying it follows', () => {
    panel()
    expect(screen.getByText('Following general (Auto)')).toBeTruthy()
    expect(screen.getByText('Following general (简体中文)')).toBeTruthy()
  })

  it('writes the shared theme from General and the override from the site group', () => {
    const props = panel()

    fireEvent.click(screen.getByTestId('settings-general-theme-dark'))
    expect(props.theme?.onSetGeneral).toHaveBeenCalledWith('dark')
    expect(props.theme?.onSetOverride).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('settings-site-theme-light'))
    expect(props.theme?.onSetOverride).toHaveBeenCalledWith('light')
  })

  it('treats the site group\'s first segment as "stop overriding"', () => {
    const props = panel({
      theme: {
        options: THEME_OPTIONS,
        generalValue: 'auto',
        override: 'dark',
        onSetGeneral: vi.fn(),
        onSetOverride: vi.fn(),
        onFollowGeneral: vi.fn(),
      },
    })

    fireEvent.click(screen.getByTestId('settings-site-theme-follow'))
    expect(props.theme?.onFollowGeneral).toHaveBeenCalled()
    expect(props.theme?.onSetOverride).not.toHaveBeenCalled()
  })

  it('clears a language override through the same follow option', () => {
    const props = panel()
    fireEvent.change(screen.getByTestId('settings-site-language'), { target: { value: '' } })
    expect(props.language?.onFollowGeneral).toHaveBeenCalled()
  })

  it('drops the override group on the portal, which has no site to override', () => {
    panel({ site: undefined })

    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.queryByTestId('settings-site-theme-follow')).toBeNull()
    expect(screen.queryByTestId('settings-site-language')).toBeNull()
    // The note about other games only makes sense where an override layer exists.
    expect(screen.queryByText(/Other games keep/)).toBeNull()
  })

  it('renders without a language section for a host that has no localization', () => {
    panel({ language: undefined })

    expect(screen.queryByTestId('settings-general-language')).toBeNull()
    expect(screen.getByTestId('settings-general-theme-auto')).toBeTruthy()
  })

  it('always carries the local-data controls, which is what it exists to house', () => {
    panel()
    expect(screen.getByTestId('local-data-controls')).toBeTruthy()
  })
})
