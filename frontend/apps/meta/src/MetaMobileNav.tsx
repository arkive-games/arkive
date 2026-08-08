import {
  IconApps,
  IconBell,
  IconBookmark,
  IconCompass,
  IconMenu2,
  IconMessageCircle,
  IconTool,
  IconUserCircle,
} from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'
import { ArkiveMark, ShellBottomNav, type ArkiveMapTheme } from '@gamemap/map-shell'
import { LANGUAGES, LANGUAGE_LABELS } from './i18n'

interface MetaMobileNavProps {
  activeView: 'discoverGames' | 'allGames' | 'forum' | 'notifications' | 'account' | 'publicProfile'
  noticeId: number
  isSignedIn: boolean
  language: string
  theme: ArkiveMapTheme
  onLanguageChange: (code: string) => void
  onThemeChange: (value: ArkiveMapTheme) => void
  onComingSoon: () => void
}

export function MetaMobileNav({
  activeView,
  noticeId,
  isSignedIn,
  language,
  theme,
  onLanguageChange,
  onThemeChange,
  onComingSoon,
}: MetaMobileNavProps) {
  const { t } = useTranslation()
  const tabs = [
    {
      key: 'discoverGames',
      label: t('nav.discoverGames'),
      icon: <IconCompass className="size-5" stroke={1.8} />,
      active: activeView === 'discoverGames',
    },
    {
      key: 'allGames',
      label: t('nav.allGames'),
      icon: <IconApps className="size-5" stroke={1.8} />,
      active: activeView === 'allGames',
    },
    {
      key: 'forum',
      label: t('nav.forum'),
      icon: <IconMessageCircle className="size-5" stroke={1.8} />,
      active: activeView === 'forum',
    },
    {
      key: 'favorites',
      label: t('nav.favorites'),
      icon: <IconBookmark className="size-5" stroke={1.8} />,
      active: activeView === 'account',
    },
  ]

  return (
    <ShellBottomNav
      pathname={`${activeView}:${noticeId}`}
      tabs={tabs}
      renderTab={(tab, className) => {
        if (tab.key === 'discoverGames') {
          return <a href="#top" className={className}>{tab.icon}<span className="max-w-full truncate">{tab.label}</span></a>
        }
        if (tab.key === 'allGames') {
          return <a href="#games" className={className}>{tab.icon}<span className="max-w-full truncate">{tab.label}</span></a>
        }
        if (tab.key === 'forum') {
          return <a href="#forum" className={className}>{tab.icon}<span className="max-w-full truncate">{tab.label}</span></a>
        }
        if (tab.key === 'favorites' && isSignedIn) {
          return <a href="#account/favorites" className={className}>{tab.icon}<span className="max-w-full truncate">{tab.label}</span></a>
        }
        return (
          <button type="button" className={className} onClick={onComingSoon}>
            {tab.icon}<span className="max-w-full truncate">{tab.label}</span>
          </button>
        )
      }}
      more={{
        label: t('nav.more'),
        icon: <IconMenu2 className="size-5" stroke={1.8} />,
        title: t('nav.more'),
        brand: (
          <a href="#top" className="inline-flex items-center gap-1.5 text-sm font-bold text-primary">
            <span className="[&>svg]:size-6"><ArkiveMark /></span>
            <span className="max-w-36 truncate">{t('brand.name')}</span>
          </a>
        ),
      }}
      grid={{
        items: [
          {
            key: 'tools',
            label: t('nav.tools'),
            icon: <IconTool className="size-5" stroke={1.8} />,
          },
          ...(isSignedIn ? [
            {
              key: 'notifications',
              label: t('userSystem.notifications.label'),
              icon: <IconBell className="size-5" stroke={1.8} />,
              active: activeView === 'notifications',
            },
            {
              key: 'account',
              label: t('userSystem.account.center'),
              icon: <IconUserCircle className="size-5" stroke={1.8} />,
              active: activeView === 'account',
            },
          ] : []),
        ],
        renderItem: (item, className) => item.key === 'notifications' ? (
          <a href="#notifications/settings" className={className}>
            {item.icon}<span className="text-center leading-tight">{item.label}</span>
          </a>
        ) : item.key === 'account' ? (
          <a href="#account/edit" className={className}>
            {item.icon}<span className="text-center leading-tight">{item.label}</span>
          </a>
        ) : (
          <button type="button" className={className} onClick={onComingSoon}>
            {item.icon}<span className="text-center leading-tight">{item.label}</span>
          </button>
        ),
      }}
      language={{
        languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
        current: language,
        onChange: onLanguageChange,
        rowLabel: t('language'),
        backLabel: t('nav.back'),
      }}
      theme={{
        options: [
          { value: 'auto', label: t('theme.auto') },
          { value: 'light', label: t('theme.light') },
          { value: 'dark', label: t('theme.dark') },
        ],
        current: theme,
        onChange: (value) => onThemeChange(value as ArkiveMapTheme),
        rowLabel: t('theme.menu'),
      }}
    />
  )
}
