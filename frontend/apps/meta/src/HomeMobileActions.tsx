import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconCheck,
  IconLanguage,
  IconMenu2,
  IconMoon,
  IconSun,
  IconSunMoon,
  IconX,
} from '@tabler/icons-react'
import { settingsStringsFor, type ArkiveMapTheme } from '@gamemap/map-shell'

import { LANGUAGES, LANGUAGE_LABELS } from './i18n'

type Panel = 'language' | 'theme' | 'menu'

const THEMES: readonly ArkiveMapTheme[] = ['auto', 'light', 'dark']
const THEME_ICONS = { auto: IconSunMoon, light: IconSun, dark: IconMoon } as const

/**
 * The portal's phone header controls on every view: language, theme and a site
 * menu, as three round buttons. The phone site has no bottom tab bar, so the
 * menu sheet carries the sections, then the account and settings once signed in.
 */
export function HomeMobileActions({ isSignedIn, hasTools, language, theme, onLanguageChange, onThemeChange, onLogin, onOpenSettings }: {
  isSignedIn: boolean
  hasTools: boolean
  language: string
  theme: ArkiveMapTheme
  onLanguageChange: (code: string) => void
  onThemeChange: (value: ArkiveMapTheme) => void
  onLogin: () => void
  onOpenSettings: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Panel | null>(null)
  const baseId = useId()
  const sheet = useRef<HTMLElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const setSheet = (node: HTMLElement | null) => { sheet.current = node }
  const close = () => setOpen(null)
  const toggle = (panel: Panel, event: MouseEvent<HTMLButtonElement>) => {
    trigger.current = event.currentTarget
    setOpen((value) => (value === panel ? null : panel))
  }

  // An open sheet takes the focus, keeps Tab inside itself, and hands the
  // focus back to the button that opened it when it closes.
  useEffect(() => {
    const root = sheet.current
    if (!open || !root) return
    const items = () => Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'))
    ;(root.querySelector<HTMLElement>('[aria-pressed="true"]') ?? items()[0])?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null)
        return
      }
      if (event.key !== 'Tab') return
      const list = items()
      const index = list.indexOf(document.activeElement as HTMLElement)
      const next = event.shiftKey
        ? (index <= 0 ? list.length - 1 : index - 1)
        : (index === -1 || index === list.length - 1 ? 0 : index + 1)
      event.preventDefault()
      list[next]?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const focus = document.activeElement
      if (!focus || focus === document.body || root.contains(focus)) trigger.current?.focus({ preventScroll: true })
    }
  }, [open])

  const ThemeIcon = THEME_ICONS[theme]
  const login = () => {
    close()
    onLogin()
  }

  return (
    <div className="home-mobile-actions">
      <button type="button" className="home-round" aria-label={t('language')} title={t('language')}
        aria-expanded={open === 'language'} aria-controls={`${baseId}-language`} onClick={(event) => toggle('language', event)}>
        <IconLanguage stroke={1.9} aria-hidden="true" />
      </button>
      <button type="button" className="home-round" aria-label={t('theme.menu')} title={t('theme.menu')}
        aria-expanded={open === 'theme'} aria-controls={`${baseId}-theme`} onClick={(event) => toggle('theme', event)}>
        <ThemeIcon stroke={1.9} aria-hidden="true" />
      </button>
      <button type="button" className="home-round" aria-label={t(open === 'menu' ? 'landing.menu.close' : 'landing.menu.open')}
        aria-expanded={open === 'menu'} aria-controls={`${baseId}-menu`} onClick={(event) => toggle('menu', event)}>
        {open === 'menu' ? <IconX stroke={2} aria-hidden="true" /> : <IconMenu2 stroke={2} aria-hidden="true" />}
      </button>

      {open && <div className="home-sheet-scrim" aria-hidden="true" onClick={close} />}

      {open === 'language' && (
        <ul ref={setSheet} id={`${baseId}-language`} className="home-sheet is-choice" aria-label={t('language')}>
          {LANGUAGES.map((code) => (
            <li key={code}>
              <button type="button" aria-pressed={code === language} onClick={() => { onLanguageChange(code); close() }}>
                <span>{LANGUAGE_LABELS[code]}</span>
                {code === language && <IconCheck stroke={2.2} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open === 'theme' && (
        <ul ref={setSheet} id={`${baseId}-theme`} className="home-sheet is-choice" aria-label={t('theme.menu')}>
          {THEMES.map((value) => {
            const Icon = THEME_ICONS[value]
            return (
              <li key={value}>
                <button type="button" aria-pressed={value === theme} onClick={() => { onThemeChange(value); close() }}>
                  <Icon stroke={1.9} aria-hidden="true" />
                  <span>{t(`theme.${value}`)}</span>
                  {value === theme && <IconCheck stroke={2.2} aria-hidden="true" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {open === 'menu' && (
        <nav ref={setSheet} id={`${baseId}-menu`} className="home-sheet" aria-label={t('landing.menu.label')}>
          <a href="#explore" onClick={close}>{t('landing.menu.discover')}</a>
          <a href="#games" onClick={close}>{t('landing.menu.allGames')}</a>
          {hasTools && <a href="#tools" onClick={close}>{t('landing.menu.tools')}</a>}
          <a href="#forum" onClick={close}>{t('landing.menu.forum')}</a>
          <hr />
          {isSignedIn ? (
            <>
              <a href="#account/edit" onClick={close}>{t('landing.menu.account')}</a>
              <a href="#notifications/settings" onClick={close}>{t('landing.menu.notifications')}</a>
              <button
                type="button"
                onClick={() => {
                  close()
                  onOpenSettings()
                }}
              >
                {settingsStringsFor(language).title}
              </button>
            </>
          ) : (
            <button type="button" className="home-sheet-login" onClick={login}>{t('landing.menu.login')}</button>
          )}
        </nav>
      )}
    </div>
  )
}
