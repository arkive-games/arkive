import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Calculator,
  Castle,
  Check,
  ChevronLeft,
  ChevronRight,
  Fish,
  FlaskConical,
  Globe,
  Hammer,
  HandHeart,
  Heart,
  Map,
  Menu,
  Microscope,
  Package,
  PawPrint,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Store,
  SunMoon,
  Swords,
  Tent,
} from 'lucide-react'
import { cn, Sheet, SheetContent, SheetHeader, SheetTitle } from '@gamemap/ui'
import { useTheme, type Theme } from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import { ARKIVE_HOME_URL, ARKIVE_HOME_LINK_PROPS } from '../lib/brand'
import {
  MAP_ENGINE_CHOICES,
  MAP_ENGINE_LABELS,
  resolveMapEngine,
  useChooseMapEngine,
  useStoredMapEngine,
} from '../lib/mapEngineChoice'
import type { NavKey } from './TopNav'
import { SiteInfo } from './SiteInfo'

type Tab = { key: NavKey; label: string; icon: typeof Map }

/**
 * Which body the More sheet is showing. The language picker is a sub-page of the
 * SAME sheet rather than a nested dialog: stacking a second Radix overlay inside
 * a Sheet is a known z-index/focus trap in this UI kit, and a phone user expects
 * a drill-down (with a back button) instead of a modal on top of a modal.
 */
type MorePane = 'main' | 'language'

/** Map a pathname (basepath already stripped by the router) to a NavKey. */
function activeKey(pathname: string): NavKey {
  if (pathname === '/' || pathname === '') return '/'
  if (pathname.startsWith('/pals')) return '/pals'
  if (pathname.startsWith('/items')) return '/items'
  if (pathname.startsWith('/buildings')) return '/buildings'
  if (pathname.startsWith('/merchants')) return '/merchants'
  if (pathname.startsWith('/technology')) return '/technology'
  if (pathname.startsWith('/research')) return '/research'
  if (pathname.startsWith('/dungeons')) return '/dungeons'
  if (pathname.startsWith('/quests')) return '/quests'
  if (pathname.startsWith('/basecamp')) return '/basecamp'
  if (pathname.startsWith('/raids')) return '/raids'
  if (pathname.startsWith('/fishing')) return '/fishing'
  if (pathname.startsWith('/passives')) return '/passives'
  if (pathname.startsWith('/active-skills')) return '/active-skills'
  if (pathname.startsWith('/partner-skills')) return '/partner-skills'
  if (pathname.startsWith('/stat-simulator')) return '/stat-simulator'
  if (pathname.startsWith('/breeding')) return '/breeding'
  // The changelog is reached from the site-info panel, not from the tab bar, so
  // it maps to itself: falling through to '/' would light up the Map tab on a
  // page that is not the map.
  if (pathname.startsWith('/changelog')) return '/changelog'
  return '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  // `find` instead of a cast: LANGUAGES is the source of truth, so an unknown
  // resolved language degrades to English rather than indexing a label table
  // with a string the table has no entry for.
  const lng = LANGUAGES.find((code) => code === i18n.resolvedLanguage) ?? 'en-US'
  const { pathname, search } = useLocation()
  const active = activeKey(pathname)
  const [moreOpen, setMoreOpen] = useState(false)
  const [pane, setPane] = useState<MorePane>('main')
  const { theme, setTheme } = useTheme()
  // The map-engine switcher lives here too, because the mobile layout renders no
  // top bar at all (that is where the desktop dropdown sits). The store is shared,
  // so tapping a pill swaps the engine on the map page behind the sheet. The
  // `?engine=` param is folded in with the same precedence App uses, so the
  // highlighted pill matches what is actually on screen when the map was opened
  // through an explicit override.
  const storedEngine = useStoredMapEngine()
  const activeEngine = resolveMapEngine((search as { engine?: unknown }).engine, storedEngine)
  const chooseEngine = useChooseMapEngine()

  // Five slots is the most a phone can fit without shrinking the labels below
  // `text-xs`, so the bar carries the map plus the three most-used tools and
  // everything else moves into the sheet.
  const primary: Tab[] = [
    { key: '/', label: t('breeding.navMap'), icon: Map },
    { key: '/breeding', label: t('breeding.navBreeding'), icon: Heart },
    { key: '/technology', label: t('tech.title'), icon: FlaskConical },
    { key: '/items', label: t('item.title'), icon: Package },
  ]
  // Everything the desktop nav offers that is not a primary tab. Labels reuse the
  // desktop keys verbatim (see TopNav) so the two navs can never drift apart, and
  // the grid stays exhaustive — on a phone this sheet is the ONLY way to reach
  // these pages.
  const more: Tab[] = [
    { key: '/pals', label: t('pal.title'), icon: PawPrint },
    { key: '/buildings', label: t('building.title'), icon: Hammer },
    { key: '/merchants', label: t('merchant.title'), icon: Store },
    { key: '/dungeons', label: t('dungeon.title'), icon: Castle },
    { key: '/quests', label: t('quest.title'), icon: ScrollText },
    { key: '/passives', label: t('pal.section.passives'), icon: Sparkles },
    { key: '/active-skills', label: t('pal.section.activeSkills'), icon: Swords },
    { key: '/partner-skills', label: t('partner.title'), icon: HandHeart },
    { key: '/stat-simulator', label: t('sim.title'), icon: Calculator },
    { key: '/research', label: t('research.title', { defaultValue: 'Research' }), icon: Microscope },
    { key: '/basecamp', label: t('basecamp.title', { defaultValue: 'Base Camp' }), icon: Tent },
    { key: '/raids', label: t('raids.title', { defaultValue: 'Base Raids' }), icon: ShieldAlert },
    { key: '/fishing', label: t('fishing.title'), icon: Fish },
  ]
  const moreActive = more.some((m) => m.key === active)

  const themeTabs: { value: Theme; label: string }[] = [
    { value: 'auto', label: t('themeAuto') },
    { value: 'light', label: t('themeLight') },
    { value: 'dark', label: t('themeDark') },
  ]

  const itemCls = (isActive: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition-colors',
      isActive ? 'text-primary' : 'text-muted-foreground',
    )

  /** One settings row: icon + label on the left, control/value on the right. */
  const rowCls = 'flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm'

  return (
    <>
      <nav
        data-testid="bottom-tab-bar"
        className="fixed inset-x-0 bottom-0 z-[2500] flex border-t border-border bg-card text-card-foreground md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {primary.map(({ key, label, icon: Icon }) => (
          <Link key={key} to={key} className={itemCls(active === key)} data-testid={`tab-${key}`}>
            <Icon className="size-5" />
            <span className="max-w-full truncate px-0.5">{label}</span>
          </Link>
        ))}
        <button
          type="button"
          data-testid="tab-more"
          onClick={() => setMoreOpen(true)}
          className={itemCls(moreActive)}
        >
          <Menu className="size-5" />
          <span className="px-0.5">{t('more')}</span>
        </button>
      </nav>

      <Sheet
        open={moreOpen}
        onOpenChange={(open) => {
          setMoreOpen(open)
          // Always reopen on the main body: a sheet that remembers it was left on
          // the language sub-page would look like the wrong menu opened.
          if (!open) setPane('main')
        }}
      >
        <SheetContent
          side="bottom"
          data-testid="more-sheet"
          className="max-h-[85dvh] overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          {/* `pr-8` keeps the brand clear of the sheet's absolute close button. */}
          <SheetHeader className="pr-8">
            <div className="flex items-center justify-between gap-2">
              {/* The title tracks the visible body so the sub-page is announced,
                  and SheetTitle stays mounted in both panes (Radix requires it). */}
              <SheetTitle>{pane === 'language' ? t('settings.language') : t('more')}</SheetTitle>
              <a
                href={ARKIVE_HOME_URL}
                {...ARKIVE_HOME_LINK_PROPS}
                aria-label={t('brandHome')}
                title={t('brandHome')}
                data-testid="more-brand"
                className="inline-flex min-w-0 items-center gap-0.5 text-sm font-bold text-primary hover:underline"
              >
                <span className="truncate">{t('brand')}</span>
                <ArrowUpRight className="size-3.5 shrink-0" />
              </a>
            </div>
          </SheetHeader>

          {pane === 'main' ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                {more.map(({ key, label, icon: Icon }) => (
                  <Link
                    key={key}
                    to={key}
                    onClick={() => setMoreOpen(false)}
                    data-testid={`more-${key}`}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border border-border p-3 text-xs font-medium',
                      active === key ? 'bg-primary text-primary-foreground' : 'bg-card text-card-foreground',
                    )}
                  >
                    <Icon className="size-5" />
                    <span className="text-center leading-tight">{label}</span>
                  </Link>
                ))}
              </div>

              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {/* A single row showing the current language, not 17 pills: the
                    full list would dominate the sheet at phone width. */}
                <button
                  type="button"
                  data-testid="more-lang-open"
                  onClick={() => setPane('language')}
                  className={rowCls}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Globe className="size-4 shrink-0 text-muted-foreground" />
                    {t('settings.language')}
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-muted-foreground">
                    <span className="truncate">{LANGUAGE_LABELS[lng]}</span>
                    <ChevronRight className="size-4 shrink-0" />
                  </span>
                </button>

                <div className={rowCls}>
                  <span className="flex min-w-0 items-center gap-2">
                    <SunMoon className="size-4 shrink-0 text-muted-foreground" />
                    {t('settings.theme')}
                  </span>
                  {/* Segmented control rather than a cycling toggle: all three
                      states are visible, so "auto" is discoverable. */}
                  <div
                    role="group"
                    aria-label={t('settings.theme')}
                    className="flex shrink-0 overflow-hidden rounded-md border border-border"
                  >
                    {themeTabs.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        data-testid={`more-theme-${value}`}
                        aria-pressed={theme === value}
                        onClick={() => setTheme(value)}
                        className={cn(
                          'px-2 py-1 text-xs font-medium transition-colors',
                          theme === value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-secondary text-secondary-foreground',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Tapping a pill deliberately leaves the sheet OPEN (unlike the nav
                  links above) so the active state visibly moves. */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">{t('engineMenu')}</span>
                <div className="flex gap-1">
                  {MAP_ENGINE_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      data-testid={`more-engine-${choice}`}
                      aria-pressed={activeEngine === choice}
                      onClick={() => chooseEngine(choice)}
                      className={cn(
                        'rounded px-2 py-1 text-xs',
                        activeEngine === choice
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground',
                      )}
                    >
                      {MAP_ENGINE_LABELS[choice].short}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <SiteInfo />
              </div>
            </>
          ) : (
            <div>
              <button
                type="button"
                data-testid="more-lang-back"
                onClick={() => setPane('main')}
                className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-1 text-sm font-medium text-muted-foreground"
              >
                <ChevronLeft className="size-4" />
                {t('settings.back')}
              </button>
              <div className="mt-1 flex flex-col">
                {LANGUAGES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    data-testid={`more-lang-${code}`}
                    aria-pressed={lng === code}
                    onClick={() => {
                      void i18n.changeLanguage(code)
                      // Straight back to the main body: the picked language is
                      // the answer, so there is nothing left to do on this page.
                      setPane('main')
                    }}
                    className={cn(
                      'flex items-center justify-between gap-2 border-b border-border px-1 py-2.5 text-left text-sm last:border-b-0',
                      lng === code ? 'font-semibold text-primary' : 'text-card-foreground',
                    )}
                  >
                    <span className="truncate">{LANGUAGE_LABELS[code]}</span>
                    {lng === code && <Check className="size-4 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
