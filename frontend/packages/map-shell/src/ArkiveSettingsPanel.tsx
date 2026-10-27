import { useState, type ReactNode } from "react"
import { IconArchive, IconCheck, IconChevronDown, IconX } from "@tabler/icons-react"
import {
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  POPUP_CLOSE_CONTROL_CLASS,
} from "@gamemap/ui"
import { useLanguagePreference } from "@gamemap/state-memory"

import { LocalDataControls, localDataStringsFor, type LocalDataStrings } from "./LocalDataControls"
import { settingsStringsFor } from "./settingsStrings"
import { useOptionalTheme, type Theme } from "./theme/ThemeProvider"

export interface ArkiveSettingsStrings {
  title: string
  /** One line under the title: where these choices are kept. */
  lede: string
  /** Carries `{game}`. */
  siteSection: string
  theme: string
  /** Beside the theme heading, explaining the automatic option. */
  themeHint: string
  language: string
  /** Carries `{game}`. */
  siteTheme: string
  /** Carries `{game}`. */
  siteLanguage: string
  followGeneral: string
  overriding: string
  /** Carries `{value}`. */
  followingGeneral: string
  otherSitesNote: string
  /** The local-data card's label. */
  localData: string
  /** The local-data card's second line: what it holds. */
  localDataSummary: string
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

/** Language lists longer than this lay out in two columns, as in the top bar. */
const LANGUAGE_GRID_THRESHOLD = 8

/**
 * One collapsible card: the label, the current value as a pill, and a chevron.
 *
 * A `details` element whose `open` the panel owns, so opening one card closes
 * the others and choosing an option can close its card. The summary's default
 * toggle is cancelled for the same reason -- the DOM must not drift from state.
 */
function SettingsCard({
  label,
  value,
  open,
  onToggle,
  testId,
  children,
}: {
  label: string
  value?: string
  open: boolean
  onToggle: () => void
  testId: string
  children: ReactNode
}) {
  return (
    <details className="arkive-settings-card" open={open} data-testid={testId}>
      <summary
        className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          event.preventDefault()
          onToggle()
        }}
      >
        <span className="min-w-0 truncate text-sm font-medium">{label}</span>
        <span
          className={cn(
            "max-w-40 truncate rounded-full px-2.5 py-0.5 text-xs text-muted-foreground",
            value && "bg-background",
          )}
        >
          {value}
        </span>
        <IconChevronDown
          data-slot="settings-chevron"
          className="size-3 text-muted-foreground"
          stroke={2.4}
          aria-hidden="true"
        />
      </summary>
      <div className="flex flex-col gap-2 pb-4">{children}</div>
    </details>
  )
}

function Options({
  label,
  options,
  current,
  onChange,
  testId,
  columns = 1,
}: {
  label: string
  options: { value: string; label: string }[]
  current: string
  onChange: (value: string) => void
  testId: string
  columns?: 1 | 2
}) {
  return (
    <div role="group" aria-label={label} className={cn("grid gap-2", columns === 2 && "grid-cols-2")}>
      {options.map((option) => {
        const selected = current === option.value
        return (
          <button
            key={option.value}
            type="button"
            data-testid={`${testId}-${option.value || "follow"}`}
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-background font-medium text-foreground"
                : "text-foreground/80 hover:bg-background/60 hover:text-foreground",
            )}
          >
            <span className="min-w-0 flex-1">{option.label}</span>
            {selected && (
              <IconCheck className="size-4 shrink-0 text-[color:var(--ring)]" stroke={2.2} aria-hidden="true" />
            )}
          </button>
        )
      })}
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

/** A heading for an always-open group, with an optional note on the right. */
function GroupHead({ label, note }: { label: string; note?: string }) {
  return (
    <div className="arkive-settings-group-head">
      <b>{label}</b>
      {note && <span>{note}</span>}
    </div>
  )
}

/**
 * The shared theme as three small pictures of a page, so the choice reads before
 * its label does. Drawn in CSS from the value: "auto" is split down the middle.
 */
function ThemeCards({
  label,
  options,
  current,
  onChange,
}: {
  label: string
  options: { value: Theme; label: string }[]
  current: Theme
  onChange: (value: Theme) => void
}) {
  return (
    <div role="group" aria-label={label} className="arkive-theme-cards">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-testid={`settings-general-theme-${option.value}`}
          aria-pressed={current === option.value}
          onClick={() => onChange(option.value)}
          className="arkive-theme-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="arkive-theme-mini" data-theme={option.value} aria-hidden="true">
            <i />
            <span><i /><i /></span>
          </span>
          <span className="truncate">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

function LanguagePills({
  label,
  options,
  current,
  onChange,
}: {
  label: string
  options: { code: string; label: string }[]
  current: string
  onChange: (code: string) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.code}
          type="button"
          data-testid={`settings-general-language-${option.code}`}
          aria-pressed={current === option.code}
          onClick={() => onChange(option.code)}
          className="arkive-language-pill outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The value the site-level options use to mean "follow General". */
const FOLLOW = ""

type CardId = "site-theme" | "site-language" | "local-data"

/**
 * Every preference this site can express.
 *
 * The shared theme and language are always open -- they are what people come
 * here to change, and three pictures and a row of pills cost little height. The
 * per-game overrides and the local data fold into cards, each naming its value
 * in a pill, so a game overriding the shared theme still reads as such in the
 * closed list. Only one card opens at a time, which keeps the 17-locale language
 * list from pushing everything else out of a phone sheet.
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
  const [openCard, setOpenCard] = useState<CardId | null>(null)
  const toggle = (id: CardId) => setOpenCard((current) => (current === id ? null : id))
  const choose = (apply: () => void) => {
    apply()
    setOpenCard(null)
  }

  const themeLabel = (value: Theme) =>
    theme?.options.find((option) => option.value === value)?.label ?? value
  const languageLabel = (code: string) =>
    language?.options.find((option) => option.code === code)?.label ?? code
  const languageOptions = language?.options.map(({ code, label }) => ({ value: code, label })) ?? []
  const languageColumns = languageOptions.length > LANGUAGE_GRID_THRESHOLD ? 2 : 1

  const overrideHint = (overriding: boolean, generalLabel: string) =>
    overriding
      ? strings.overriding
      : fill(strings.followingGeneral, { value: generalLabel })

  return (
    <div className="arkive-settings-list flex flex-col gap-2.5" data-testid="arkive-settings-panel">
      {theme && (
        <section className="arkive-settings-group" data-testid="settings-group-theme">
          <GroupHead label={strings.theme} note={strings.themeHint} />
          <ThemeCards
            label={strings.theme}
            options={theme.options}
            current={theme.generalValue}
            onChange={theme.onSetGeneral}
          />
        </section>
      )}
      {language && (
        <section className="arkive-settings-group" data-testid="settings-group-language">
          <GroupHead label={strings.language} />
          <LanguagePills
            label={strings.language}
            options={language.options}
            current={language.generalValue}
            onChange={language.onSetGeneral}
          />
        </section>
      )}
      {site && (theme || language) && <Hint>{strings.otherSitesNote}</Hint>}

      {site && theme && (
        <SettingsCard
          label={fill(strings.siteTheme, { game: site.name })}
          value={theme.override === null ? strings.followGeneral : themeLabel(theme.override)}
          open={openCard === "site-theme"}
          onToggle={() => toggle("site-theme")}
          testId="settings-card-site-theme"
        >
          <Hint>{overrideHint(theme.override !== null, themeLabel(theme.generalValue))}</Hint>
          <Options
            label={fill(strings.siteSection, { game: site.name })}
            testId="settings-site-theme"
            options={[
              { value: FOLLOW, label: strings.followGeneral },
              ...theme.options.map((option) => ({ ...option, value: option.value as string })),
            ]}
            current={theme.override ?? FOLLOW}
            onChange={(value) => choose(() =>
              value === FOLLOW ? theme.onFollowGeneral() : theme.onSetOverride(value as Theme)
            )}
          />
        </SettingsCard>
      )}
      {site && language && (
        <SettingsCard
          label={fill(strings.siteLanguage, { game: site.name })}
          value={language.override === null ? strings.followGeneral : languageLabel(language.override)}
          open={openCard === "site-language"}
          onToggle={() => toggle("site-language")}
          testId="settings-card-site-language"
        >
          <Hint>
            {overrideHint(language.override !== null, languageLabel(language.generalValue))}
          </Hint>
          <Options
            label={fill(strings.siteSection, { game: site.name })}
            testId="settings-site-language"
            options={[{ value: FOLLOW, label: strings.followGeneral }, ...languageOptions]}
            current={language.override ?? FOLLOW}
            columns={languageColumns}
            onChange={(code) => choose(() =>
              code === FOLLOW ? language.onFollowGeneral() : language.onSetOverride(code)
            )}
          />
        </SettingsCard>
      )}
      {site && siteExtras}

      <details className="arkive-data-hold" open={openCard === "local-data"} data-testid="settings-card-local-data">
        <summary
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            event.preventDefault()
            toggle("local-data")
          }}
        >
          <span className="arkive-data-hold-icon" aria-hidden="true">
            <IconArchive className="size-4.5" stroke={2.2} />
          </span>
          <span className="min-w-0 flex-1">
            <b>{strings.localData}</b>
            <small>{strings.localDataSummary}</small>
          </span>
          <IconChevronDown
            data-slot="settings-chevron"
            className="size-4.5 text-muted-foreground"
            stroke={2.2}
            aria-hidden="true"
          />
        </summary>
        <LocalDataControls strings={localData} />
      </details>
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
        showCloseButton={false}
        showTideLine={false}
        className="arkive-settings-dialog max-h-[min(85dvh,44rem)] grid-rows-[auto_minmax(0,1fr)] gap-5 rounded-[var(--arkive-radius-dialog)] border-0 p-6 sm:max-w-[25rem]"
      >
        <DialogHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-left">
          <DialogTitle className="arkive-dialog-title text-xl font-bold sm:text-2xl">
            {panel.strings.title}
          </DialogTitle>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(POPUP_CLOSE_CONTROL_CLASS, "group shrink-0 -m-1.5 md:-m-0.5 hover:bg-transparent")}
              aria-label={panel.strings.close}
              title={panel.strings.close}
            >
              <span className="grid size-8 place-items-center rounded-full bg-foreground/[0.06] transition-colors group-hover:bg-foreground/10">
                <IconX className="size-4" stroke={1.8} />
              </span>
            </Button>
          </DialogClose>
          <DialogDescription className="col-span-2">{panel.strings.lede}</DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 overflow-y-auto px-1">
          <ArkiveSettingsPanel {...panel} />
        </div>
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
