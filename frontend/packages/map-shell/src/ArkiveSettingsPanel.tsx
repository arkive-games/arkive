import type { ReactNode } from "react"
import { IconLanguage, IconMoonStars } from "@tabler/icons-react"
import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gamemap/ui"
import { useLanguagePreference } from "@gamemap/state-memory"

import { LocalDataControls, localDataStringsFor, type LocalDataStrings } from "./LocalDataControls"
import { settingsStringsFor } from "./settingsStrings"
import { useOptionalTheme, type Theme } from "./theme/ThemeProvider"

export interface ArkiveSettingsStrings {
  title: string
  general: string
  generalDescription: string
  /** Carries `{game}`. */
  siteSection: string
  siteDescription: string
  theme: string
  language: string
  followGeneral: string
  overriding: string
  /** Carries `{value}`. */
  followingGeneral: string
  otherSitesNote: string
  close: string
}

export interface ArkiveSettingsThemeConfig {
  options: { value: Theme; label: string }[]
  /** Shown selected under General: the shared value, or the app default while unset. */
  generalValue: Theme
  /** `null` when this site follows General. */
  override: Theme | null
  onSetGeneral: (value: Theme) => void
  onSetOverride: (value: Theme) => void
  onFollowGeneral: () => void
}

export interface ArkiveSettingsLanguageConfig {
  options: { code: string; label: string }[]
  generalValue: string
  override: string | null
  onSetGeneral: (code: string) => void
  onSetOverride: (code: string) => void
  onFollowGeneral: () => void
}

export interface ArkiveSettingsPanelProps {
  strings: ArkiveSettingsStrings
  localData: LocalDataStrings
  /**
   * The current game. Omitted on meta, which is the portal: it writes the shared
   * values directly and has no override layer, so it renders no second group.
   */
  site?: { name: string }
  /** Omitted when the host injects a theme adapter without layer support. */
  theme?: ArkiveSettingsThemeConfig
  /** Omitted by a host with no localization, such as lostark. */
  language?: ArkiveSettingsLanguageConfig
  /** Game-owned rows appended to the site group, e.g. a map renderer choice. */
  siteExtras?: ReactNode
}

/** `{name}` substitution, so the catalogue holds sentences rather than fragments. */
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

const GROUP_TITLE =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground"

const ROW = "flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1.5"

/** Matches the segmented control in ShellBottomNav, so both surfaces read alike. */
function pillClass(selected: boolean) {
  return cn(
    "flex min-h-9 min-w-0 items-center justify-center whitespace-normal px-2.5 py-1 text-center text-xs font-semibold leading-tight transition-colors",
    selected ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
  )
}

function Segmented({
  label,
  options,
  current,
  onChange,
  testId,
}: {
  label: string
  options: { value: string; label: string }[]
  current: string
  onChange: (value: string) => void
  testId: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex max-w-full overflow-hidden rounded-md border border-border"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-testid={`${testId}-${option.value || "follow"}`}
          aria-pressed={current === option.value}
          onClick={() => onChange(option.value)}
          className={pillClass(current === option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A native select, deliberately, rather than the UI kit's Select.
 *
 * This panel renders inside the phone navigation sheet as well as in a dialog,
 * and a portalled listbox opened from inside a sheet has its pointer events
 * swallowed by the sheet overlay -- it goes dead rather than merely looking
 * wrong. A native control has no portal, and hands a 17-locale list to the
 * platform picker on a phone instead of to a scrolling div.
 */
function LanguageSelect({
  label,
  options,
  current,
  onChange,
  testId,
}: {
  label: string
  options: { code: string; label: string }[]
  current: string
  onChange: (code: string) => void
  testId: string
}) {
  return (
    <select
      aria-label={label}
      data-testid={testId}
      value={current}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-9 max-w-[60%] truncate rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function Row({
  icon,
  label,
  hint,
  children,
}: {
  icon: ReactNode
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className={ROW}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          {label}
        </span>
        {hint && <span className="pl-7 text-xs text-muted-foreground">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

function Group({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-1 border-b border-border pb-1.5">
        <h3 className={GROUP_TITLE}>{title}</h3>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** The value the site-level segmented control uses to mean "follow General". */
const FOLLOW = ""

/**
 * Every preference this site can express, in one scroll.
 *
 * One scroll rather than a category rail: there are about eight rows, and more
 * importantly both layers have to be visible together. "This game is overriding
 * general" is the single thing a two-layer model must communicate without being
 * clicked, and a rail hides one layer behind the other.
 *
 * Purely presentational. Values, callbacks and strings all arrive from the host,
 * because this package is grep-gated against storage, network and i18n.
 */
export function ArkiveSettingsPanel({
  strings,
  localData,
  site,
  theme,
  language,
  siteExtras,
}: ArkiveSettingsPanelProps) {
  const themeLabel = (value: Theme) =>
    theme?.options.find((option) => option.value === value)?.label ?? value
  const languageLabel = (code: string) =>
    language?.options.find((option) => option.code === code)?.label ?? code

  const overrideHint = (overriding: boolean, generalLabel: string) =>
    overriding
      ? strings.overriding
      : fill(strings.followingGeneral, { value: generalLabel })

  return (
    <div className="flex flex-col gap-5" data-testid="arkive-settings-panel">
      <Group title={strings.general} description={strings.generalDescription}>
        {theme && (
          <Row icon={<IconMoonStars className="size-4" stroke={1.8} />} label={strings.theme}>
            <Segmented
              label={strings.theme}
              testId="settings-general-theme"
              options={theme.options}
              current={theme.generalValue}
              onChange={(value) => theme.onSetGeneral(value as Theme)}
            />
          </Row>
        )}
        {language && (
          <Row icon={<IconLanguage className="size-4" stroke={1.8} />} label={strings.language}>
            <LanguageSelect
              label={strings.language}
              testId="settings-general-language"
              options={language.options}
              current={language.generalValue}
              onChange={language.onSetGeneral}
            />
          </Row>
        )}
        {site && <p className="text-xs text-muted-foreground">{strings.otherSitesNote}</p>}
      </Group>

      {site && (theme || language || siteExtras) && (
        <Group
          title={fill(strings.siteSection, { game: site.name })}
          description={strings.siteDescription}
        >
          {theme && (
            <Row
              icon={<IconMoonStars className="size-4" stroke={1.8} />}
              label={strings.theme}
              hint={overrideHint(theme.override !== null, themeLabel(theme.generalValue))}
            >
              <Segmented
                label={fill(strings.siteSection, { game: site.name })}
                testId="settings-site-theme"
                options={[
                  { value: FOLLOW, label: strings.followGeneral },
                  ...theme.options.map((option) => ({ ...option, value: option.value as string })),
                ]}
                current={theme.override ?? FOLLOW}
                onChange={(value) =>
                  value === FOLLOW ? theme.onFollowGeneral() : theme.onSetOverride(value as Theme)
                }
              />
            </Row>
          )}
          {language && (
            <Row
              icon={<IconLanguage className="size-4" stroke={1.8} />}
              label={strings.language}
              hint={overrideHint(
                language.override !== null,
                languageLabel(language.generalValue),
              )}
            >
              <LanguageSelect
                label={fill(strings.siteSection, { game: site.name })}
                testId="settings-site-language"
                options={[
                  { code: FOLLOW, label: strings.followGeneral },
                  ...language.options,
                ]}
                current={language.override ?? FOLLOW}
                onChange={(code) =>
                  code === FOLLOW ? language.onFollowGeneral() : language.onSetOverride(code)
                }
              />
            </Row>
          )}
          {siteExtras}
        </Group>
      )}

      <Group title={localData.title}>
        <LocalDataControls strings={localData} />
      </Group>
    </div>
  )
}

/**
 * The desktop host for the panel: a controlled dialog opened from the account
 * menu.
 *
 * Controlled rather than trigger-based because the trigger is a row inside a
 * hover menu that closes on selection, so the menu cannot own the dialog's
 * lifetime.
 */
export function ArkiveSettingsDialog({
  open,
  onOpenChange,
  ...panel
}: ArkiveSettingsPanelProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="settings-dialog"
        className="max-h-[min(85dvh,44rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{panel.strings.title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          <ArkiveSettingsPanel {...panel} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {panel.strings.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * What a host declares once and hands to every settings surface it has.
 *
 * The theme half is deliberately absent: it comes from ThemeProvider, which
 * already holds both layers and must be the one to write them so the page
 * re-renders. Only the labels are per-app, and aion2 does flavour them.
 */
export interface ArkiveSettingsConfig {
  /** The host's current language tag, for this package's bundled strings. */
  locale?: string
  site?: { name: string }
  themeOptions?: { value: Theme; label: string }[]
  language?: ArkiveSettingsLanguageConfig
  siteExtras?: ReactNode
}

/**
 * Assembles panel props from a host config plus the theme context.
 *
 * Shared by the desktop dialog and the phone sheet's settings pane so the two
 * cannot drift into offering different rows.
 */
export function useArkiveSettingsProps({
  locale,
  site,
  themeOptions,
  language,
  siteExtras,
}: ArkiveSettingsConfig): ArkiveSettingsPanelProps {
  const theme = useOptionalTheme()

  return {
    strings: settingsStringsFor(locale),
    localData: localDataStringsFor(locale),
    site,
    theme:
      theme?.supportsThemeLayers && themeOptions
        ? {
            options: themeOptions,
            generalValue: theme.globalTheme ?? theme.defaultTheme,
            override: theme.overrideTheme,
            onSetGeneral: theme.setGlobalTheme,
            onSetOverride: theme.setThemeOverride,
            onFollowGeneral: theme.clearThemeOverride,
          }
        : undefined,
    language,
    siteExtras,
  }
}

/**
 * The language half of a host's settings config, wired to the two records.
 *
 * Here rather than repeated in six apps: the mapping from a host's language
 * list to the panel's shape is identical everywhere, and only `apply` differs
 * -- it is the host's own language-change call, which this package must not
 * name or import.
 */
export function useArkiveLanguageSettings<T extends string>({
  languages,
  labels,
  fallback,
  apply,
}: {
  languages: readonly T[]
  labels: Record<T, string>
  fallback: T
  apply: (code: T) => void
}): ArkiveSettingsLanguageConfig {
  const controls = useLanguagePreference(languages, fallback, apply)

  return {
    options: languages.map((code) => ({ code, label: labels[code] })),
    generalValue: controls.generalValue,
    override: controls.override,
    onSetGeneral: (code) => controls.setGeneral(code as T),
    onSetOverride: (code) => controls.setOverride(code as T),
    onFollowGeneral: controls.followGeneral,
  }
}
