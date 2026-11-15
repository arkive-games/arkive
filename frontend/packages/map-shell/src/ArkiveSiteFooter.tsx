import { useState } from 'react'
import { SiteFooter, type SiteFooterProps } from '@gamemap/ui'
import { ArkiveSettingsDialog, useArkiveSettingsProps, type ArkiveSettingsConfig } from './ArkiveSettingsPanel'
import { footerStringsFor } from './locales/footer'

export interface ArkiveSiteFooterProps extends SiteFooterProps {
  locale: string
  settings: ArkiveSettingsConfig
}

/** Ordinary game footer: shared site links and the current game's settings. */
export function ArkiveSiteFooter({ locale, settings, homeUrl = 'https://arkive.games', navigation, ...props }: ArkiveSiteFooterProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const panel = useArkiveSettingsProps({ ...settings, locale: settings.locale ?? locale })
  const labels = footerStringsFor(locale)
  const destination = (dialog?: 'about' | 'contact') => {
    const url = new URL(homeUrl, window.location.href)
    url.hash = 'games'
    if (dialog) url.searchParams.set('footer', dialog)
    else url.hash = 'updates'
    return url.href
  }

  return <>
    <SiteFooter {...props} homeUrl={homeUrl} navigation={navigation ?? <>
      <a href={destination('about')}>{labels.about}</a>
      <a href={destination('contact')}>{labels.contact}</a>
      <a href={destination()}>{labels.updates}</a>
      <button type="button" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>{panel.strings.title}</button>
    </>} />
    <ArkiveSettingsDialog {...panel} open={settingsOpen} onOpenChange={setSettingsOpen} />
  </>
}
