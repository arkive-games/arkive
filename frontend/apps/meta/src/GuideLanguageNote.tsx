import { useTranslation } from 'react-i18next'
import type { SiteCard } from './sites'

export function GuideLanguageNote({ site }: { site?: SiteCard }) {
  const { t, i18n } = useTranslation()
  if (!site?.guideLanguage || site.guideLanguage === (i18n.resolvedLanguage ?? i18n.language)) return null
  return <span className="block text-xs font-normal text-muted-foreground">{t('catalogStatus.chineseOnly')}</span>
}
