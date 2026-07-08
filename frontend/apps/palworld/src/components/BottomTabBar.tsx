import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from '@tanstack/react-router'
import { Map, PawPrint, Package, Hammer, Menu, FlaskConical, ScrollText, Heart, Sparkles } from 'lucide-react'
import { cn, Sheet, SheetContent, SheetHeader, SheetTitle } from '@gamemap/ui'
import { ThemeToggle } from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS } from '../i18n'
import type { NavKey } from './TopNav'

type Tab = { key: NavKey; label: string; icon: typeof Map }

/** Map a pathname (basepath already stripped by the router) to a NavKey. */
function activeKey(pathname: string): NavKey {
  if (pathname === '/' || pathname === '') return '/'
  if (pathname.startsWith('/pals')) return '/pals'
  if (pathname.startsWith('/items')) return '/items'
  if (pathname.startsWith('/buildings')) return '/buildings'
  if (pathname.startsWith('/technology')) return '/technology'
  if (pathname.startsWith('/quests')) return '/quests'
  if (pathname.startsWith('/passives')) return '/passives'
  if (pathname.startsWith('/breeding')) return '/breeding'
  return '/'
}

export function BottomTabBar() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const { pathname } = useLocation()
  const active = activeKey(pathname)
  const [moreOpen, setMoreOpen] = useState(false)

  const primary: Tab[] = [
    { key: '/', label: t('breeding.navMap'), icon: Map },
    { key: '/pals', label: t('pal.title'), icon: PawPrint },
    { key: '/items', label: t('item.title'), icon: Package },
    { key: '/buildings', label: t('building.title'), icon: Hammer },
  ]
  const more: Tab[] = [
    { key: '/technology', label: t('tech.title'), icon: FlaskConical },
    { key: '/quests', label: t('quest.title'), icon: ScrollText },
    { key: '/breeding', label: t('breeding.navBreeding'), icon: Heart },
    { key: '/passives', label: t('pal.section.passives'), icon: Sparkles },
  ]
  const moreActive = more.some((m) => m.key === active)

  const itemCls = (isActive: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs font-medium transition-colors',
      isActive ? 'text-primary' : 'text-muted-foreground',
    )

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

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          data-testid="more-sheet"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
          <SheetHeader>
            <SheetTitle>{t('more')}</SheetTitle>
          </SheetHeader>
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
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex flex-wrap gap-1">
              {LANGUAGES.map((code) => (
                <button
                  key={code}
                  type="button"
                  data-testid={`more-lang-${code}`}
                  onClick={() => void i18n.changeLanguage(code)}
                  className={cn(
                    'rounded px-2 py-1 text-xs',
                    lng === code ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {LANGUAGE_LABELS[code]}
                </button>
              ))}
            </div>
            <ThemeToggle labels={{ auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') }} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
