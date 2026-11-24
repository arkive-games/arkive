import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SiteFooter } from '@gamemap/ui'
import { IS_TOY } from './sites'

export function StandardFooter({ navigation, hasMobileBottomNav = false }: { navigation: ReactNode; hasMobileBottomNav?: boolean }) {
  const { t } = useTranslation()
  return (
    <SiteFooter
      className={hasMobileBottomNav ? 'max-md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]' : undefined}
      homeUrl="#top"
      homeLinkProps={{ target: undefined, rel: undefined }}
      githubUrl={null}
      icpBeian={IS_TOY ? null : (import.meta.env.VITE_ICP_BEIAN ?? t('footer.icp'))}
      data-testid="compact-site-footer"
      navigation={navigation}
    />
  )
}
