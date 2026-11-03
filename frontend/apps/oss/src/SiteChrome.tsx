import { History, Map as MapIcon, Menu } from 'lucide-react'
import { ArkiveAccountControl } from '@gamemap/auth'
import { ARKIVE_FEEDBACK_QQ_GROUP, ARKIVE_ICP_RECORD } from '@gamemap/ui'
import { ArkiveSiteInfo, ArkiveSiteInfoDialog, ShellBottomNav, resolveArkiveHomeUrl } from '@gamemap/map-shell'
import text from './locales/zh-CN.json'
import history from './changelog.json'

export const homeUrl = resolveArkiveHomeUrl({ envUrl: import.meta.env.VITE_ARKIVE_HOME_URL, dev: import.meta.env.DEV, toy: Boolean(import.meta.env.VITE_TOY) })
export const settings = { locale: 'zh-CN', site: { name: text.game } }

export function SiteInfo() {
  return <ArkiveSiteInfo
    strings={text.siteInfo} arkiveName={text.brand} arkiveHomeUrl={homeUrl}
    gameName={text.game} developerName="Thekla, Inc." version={history.entries[0].version}
    gameUpdatesUrl="/changelog" icpRecord={ARKIVE_ICP_RECORD}
    feedbackGroup={{ label: text.siteInfo.feedbackGroupLabel, number: ARKIVE_FEEDBACK_QQ_GROUP, copyLabel: text.siteInfo.copy, copiedLabel: text.siteInfo.copied }}
  />
}

export function SiteInfoDialog() {
  return <ArkiveSiteInfoDialog labels={{ trigger: text.siteInfo.tab, title: text.siteInfo.aboutTitle, close: text.siteInfo.close }}><SiteInfo /></ArkiveSiteInfoDialog>
}

export function MobileMenu() {
  const pathname = window.location.pathname
  return <ShellBottomNav
    pathname={pathname}
    tabs={[
      { key: '/', label: text.map, icon: <MapIcon className="size-5" />, active: pathname === '/' },
      { key: '/changelog', label: text.changelog, icon: <History className="size-5" />, active: pathname.startsWith('/changelog') },
      { key: homeUrl, label: text.home, icon: <MapIcon className="size-5" /> },
    ]}
    renderTab={(tab, className) => <a href={tab.key} className={className}>{tab.icon}<span>{tab.label}</span></a>}
    more={{ label: text.menu, title: text.menu, icon: <Menu className="size-5" /> }}
    language={{ languages: [{ code: 'zh-CN', label: text.languageName }], current: 'zh-CN', onChange: () => {}, rowLabel: text.language, backLabel: text.back }}
    theme={{ options: [{ value: 'auto', label: text.auto }, { value: 'light', label: text.light }, { value: 'dark', label: text.dark }], rowLabel: text.theme }}
    settings={{ backLabel: text.back, config: settings }}
    footer={<><ArkiveAccountControl language="zh-CN" homeUrl={homeUrl} settings={settings} /><SiteInfo /></>}
  />
}
