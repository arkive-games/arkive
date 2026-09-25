import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveMapTopBar, useTheme, type ShellNavItem } from '@gamemap/map-shell'
import content from '../locales/zh-CN.json'
import { HOME_URL, SETTINGS } from '../lib/brand'
import { hrefForKey, navigateOnClick, WIKI_VIEWS, type NavKey, type NavigationProps } from '../navigation'

/**
 * The desktop bar, in the shape every other game uses: the home page first,
 * then sections, with the seven encyclopedia tables folded into one dropdown
 * rather than a second row of tabs under the bar.
 */
export function TopNav({ active, onNavigate }: NavigationProps) {
  const { theme, setTheme } = useTheme()

  const items: ShellNavItem[] = [
    { key: 'overview', label: content.nav.home, active: active === 'overview' },
    {
      key: 'wiki',
      label: content.nav.wiki,
      active: active.startsWith('wiki-'),
      children: WIKI_VIEWS.map((view) => ({
        key: `wiki-${view}`,
        label: content.wiki.tabs[view],
        active: active === `wiki-${view}`,
      })),
    },
    { key: 'builds', label: content.builds.title, active: active === 'builds' },
  ]

  return (
    <ArkiveMapTopBar
      homeUrl={HOME_URL}
      homeLabel={content.homeLabel}
      brandName={content.brandName}
      brandSlogan={content.brandSlogan}
      nav={{
        items,
        // Only leaves reach this: the shell renders a dropdown's trigger as its
        // own button, so the group key 'wiki' never becomes a link.
        renderItem: (item, className, labelClassName) => (
          <a href={hrefForKey(item.key)} className={className} onClick={navigateOnClick(item.key as NavKey, onNavigate)}>
            {labelClassName ? (
              <span data-slot="nav-item-label" className={labelClassName}>{item.label}</span>
            ) : item.label}
          </a>
        ),
      }}
      languageSwitcher={{
        languages: [{ code: 'zh-CN', label: content.language }],
        current: 'zh-CN',
        onChange: () => undefined,
        menuLabel: content.languageMenu,
        shortLabel: content.languageShort,
      }}
      themeSwitcher={{
        labels: content.theme,
        current: theme,
        onChange: setTheme,
        menuLabel: content.themeMenu,
        shortLabel: content.themeMenu,
      }}
      loginLabel={content.login}
      accountSlot={<ArkiveAccountControl language="zh-CN" settings={SETTINGS} />}
    />
  )
}
