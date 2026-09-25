import type { ReactNode } from 'react'
import { BookOpen, Gem, Ghost, History, Home, Menu, PawPrint, ScrollText, Shield, Sparkles, Swords } from 'lucide-react'
import { ShellBottomNav, useTheme, type Theme } from '@gamemap/map-shell'
import content from '../locales/zh-CN.json'
import { SETTINGS } from '../lib/brand'
import { hrefForKey, navigateOnClick, type NavKey, type NavigationProps } from '../navigation'

const icon = (Icon: typeof Home): ReactNode => <Icon className="size-5" strokeWidth={1.8} />

/**
 * The phone navigation, on the shared strip every other game uses. It is at the
 * documented ceiling of four tabs, so the other five tables and the version
 * history sit in the More sheet -- below `md` the desktop dropdown is gone, and
 * a page left out of both would have no entry point at all.
 */
export function BottomTabBar({ active, onNavigate }: NavigationProps) {
  const { theme, setTheme } = useTheme()

  const tabs: { key: NavKey; label: string; icon: ReactNode }[] = [
    { key: 'overview', label: content.nav.home, icon: icon(Home) },
    { key: 'wiki-skills', label: content.wiki.tabs.skills, icon: icon(Swords) },
    { key: 'wiki-cards', label: content.wiki.tabs.cards, icon: icon(BookOpen) },
    { key: 'builds', label: content.builds.title, icon: icon(ScrollText) },
  ]
  const more: { key: NavKey; label: string; icon: ReactNode }[] = [
    { key: 'wiki-talents', label: content.wiki.tabs.talents, icon: icon(Sparkles) },
    { key: 'wiki-pets', label: content.wiki.tabs.pets, icon: icon(PawPrint) },
    { key: 'wiki-monsters', label: content.wiki.tabs.monsters, icon: icon(Ghost) },
    { key: 'wiki-equipment', label: content.wiki.tabs.equipment, icon: icon(Shield) },
    { key: 'wiki-souls', label: content.wiki.tabs.souls, icon: icon(Gem) },
    { key: 'changelog', label: content.changelog.title, icon: icon(History) },
  ]

  return (
    <ShellBottomNav
      // The sheet closes whenever this changes, so a tap that navigates cannot
      // leave the sheet covering its own destination.
      pathname={active}
      tabs={tabs.map((tab) => ({ ...tab, active: active === tab.key }))}
      renderTab={(tab, className) => (
        <a href={hrefForKey(tab.key)} className={className} onClick={navigateOnClick(tab.key as NavKey, onNavigate)}>
          {tab.icon}<span className="max-w-full truncate">{tab.label}</span>
        </a>
      )}
      more={{
        label: content.nav.more,
        icon: <Menu className="size-5" strokeWidth={1.8} />,
        active: !tabs.some((tab) => tab.key === active),
        title: content.nav.more,
      }}
      grid={{
        items: more.map((item) => ({ ...item, active: active === item.key })),
        renderItem: (item, className) => (
          <a href={hrefForKey(item.key)} className={className} onClick={navigateOnClick(item.key as NavKey, onNavigate)}>
            {item.icon}<span className="text-center leading-tight">{item.label}</span>
          </a>
        ),
      }}
      language={{
        languages: [{ code: 'zh-CN', label: content.language }],
        current: 'zh-CN',
        onChange: () => undefined,
        rowLabel: content.languageMenu,
        backLabel: content.nav.back,
      }}
      theme={{
        options: SETTINGS.themeOptions ?? [],
        current: theme,
        onChange: (value) => setTheme(value as Theme),
        rowLabel: content.themeMenu,
      }}
      settings={{ backLabel: content.nav.back, config: SETTINGS }}
    />
  )
}
