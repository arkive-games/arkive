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

function pressed(testId: string): boolean {
  return screen.getByTestId(testId).getAttribute('aria-pressed') === 'true'
}

/** The summary row: label, value pill, chevron. */
function cardText(testId: string): string {
  return screen.getByTestId(testId).querySelector('summary')?.textContent ?? ''
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

    // General still reads zh-CN while this site reads ja-JP, both on closed cards.
    expect(cardText('settings-card-language')).toContain(LANGUAGE_OPTIONS[1].label)
    expect(cardText('settings-card-site-language')).toContain('Palworld language')
    expect(cardText('settings-card-site-language')).toContain(LANGUAGE_OPTIONS[2].label)
    expect(cardText('settings-card-site-theme')).toContain('Follow general')
    expect(pressed('settings-general-language-zh-CN')).toBe(true)
    expect(pressed('settings-site-language-ja-JP')).toBe(true)
    expect(screen.getByText('Overriding general')).toBeTruthy()
  })

  it('names the value a following site inherits, rather than only saying it follows', () => {
    panel()
    expect(screen.getByText('Following general (Auto)')).toBeTruthy()
    expect(screen.getByText(`Following general (${LANGUAGE_OPTIONS[1].label})`)).toBeTruthy()
  })

  it('opens one card at a time and closes it once a value is chosen', () => {
    panel()
    const theme = screen.getByTestId('settings-card-theme') as HTMLDetailsElement
    const language = screen.getByTestId('settings-card-language') as HTMLDetailsElement

    fireEvent.click(theme.querySelector('summary')!)
    expect(theme.open).toBe(true)
    fireEvent.click(language.querySelector('summary')!)
    expect(theme.open).toBe(false)
    expect(language.open).toBe(true)

    fireEvent.click(screen.getByTestId('settings-general-language-en-US'))
    expect(language.open).toBe(false)
  })

  it('writes the shared theme from General and the override from the site card', () => {
    const props = panel()

    fireEvent.click(screen.getByTestId('settings-general-theme-dark'))
    expect(props.theme?.onSetGeneral).toHaveBeenCalledWith('dark')
    expect(props.theme?.onSetOverride).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('settings-site-theme-light'))
    expect(props.theme?.onSetOverride).toHaveBeenCalledWith('light')
  })

  it('treats the site card\'s first option as "stop overriding"', () => {
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
    fireEvent.click(screen.getByTestId('settings-site-language-follow'))
    expect(props.language?.onFollowGeneral).toHaveBeenCalled()
  })

  it('drops the override cards on the portal, which has no site to override', () => {
    panel({ site: undefined })

    expect(screen.getByTestId('settings-card-theme')).toBeTruthy()
    expect(screen.queryByTestId('settings-card-site-theme')).toBeNull()
    expect(screen.queryByTestId('settings-card-site-language')).toBeNull()
    // The note about other games only makes sense where an override layer exists.
    expect(screen.queryByText(/Other games keep/)).toBeNull()
  })

  it('renders without a language card for a host that has no localization', () => {
    panel({ language: undefined })

    expect(screen.queryByTestId('settings-card-language')).toBeNull()
    expect(screen.getByTestId('settings-general-theme-auto')).toBeTruthy()
  })

  it('always carries the local-data controls, which is what it exists to house', () => {
    panel()
    expect(cardText('settings-card-local-data')).toContain('Local data')
    expect(screen.getByTestId('local-data-controls')).toBeTruthy()
  })
})