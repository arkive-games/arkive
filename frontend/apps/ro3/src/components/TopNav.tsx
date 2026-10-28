import { ArkiveAccountControl } from '@gamemap/auth'
import { ArkiveMapTopBar, type ShellNavItem } from '@gamemap/map-shell'
import gameIcon from '../assets/ro3-icon.webp'
import content from '../locales/zh-CN.json'
import { HOME_URL, SETTINGS } from '../lib/brand'
import { hrefForKey, navigateOnClick, type NavKey, type NavigationProps } from '../navigation'

/**
 * The desktop bar, in the shape every other game uses: the home page first,
 * then sections. The encyclopedia is one plain link to its first table; the
 * wiki's own sidebar picks the rest, so the bar needs no dropdown.
 */
export function TopNav({ active, onNavigate }: NavigationProps) {

  const items: ShellNavItem[] = [
    { key: 'overview', label: content.nav.home, active: active === 'overview' },
    { key: 'wiki-skills', label: content.nav.wiki, active: active.startsWith('wiki-') },
    { key: 'builds', label: content.builds.title, active: active === 'builds' },
  ]

  return (
    <ArkiveMapTopBar
      homeUrl={HOME_URL}
      homeLabel={content.homeLabel}
      brandName={content.brandName}
      game={{ name: content.pageTitle, icon: gameIcon }}
      nav={{
        items,
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
        menuLabel: content.themeMenu,
        shortLabel: content.themeMenu,
      }}
      loginLabel={content.login}
      accountSlot={<ArkiveAccountControl language="zh-CN" settings={SETTINGS} homeUrl={HOME_URL} />}
    />
  )
}
