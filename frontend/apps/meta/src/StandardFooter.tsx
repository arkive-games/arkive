import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SiteFooter } from '@gamemap/ui'
import { settingsStringsFor } from '@gamemap/map-shell'
import { AboutDialog, ContactDialog } from './HomeFooter'
import { IS_TOY } from './sites'

export function StandardFooter({ brandName, onOpenSettings }: { brandName: string; onOpenSettings: () => void }) {
  const { t, i18n } = useTranslation()
  const [dialog, setDialog] = useState<'about' | 'contact' | null>(null)
  return <>
    <SiteFooter
      homeUrl="#top"
      homeLinkProps={{ target: undefined, rel: undefined }}
      githubUrl={null}
      icpBeian={IS_TOY ? null : (import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp'))}
      data-testid="compact-site-footer"
      navigation={<>
        <button type="button" aria-haspopup="dialog" onClick={() => setDialog('about')}>{t('footer.aboutArkive')}</button>
        <button type="button" aria-haspopup="dialog" onClick={() => setDialog('contact')}>{t('footer.contact')}</button>
        <a href="#updates">{t('footer.updateHistory')}</a>
        <button type="button" onClick={onOpenSettings}>{settingsStringsFor(i18n.resolvedLanguage ?? i18n.language).title}</button>
      </>}
    />
    <AboutDialog open={dialog === 'about'} brandName={brandName} onOpenChange={open => setDialog(open ? 'about' : null)} />
    <ContactDialog open={dialog === 'contact'} onOpenChange={open => setDialog(open ? 'contact' : null)} />
  </>
}
