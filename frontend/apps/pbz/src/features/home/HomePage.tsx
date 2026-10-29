import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <ContentPage active="/" title={t('siteTitle')}>
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold">{t('siteTitle')}</h1>
        <p className="text-muted-foreground">{t('home.tagline')}</p>
        <p className="text-sm text-muted-foreground">{t('home.comingSoon')}</p>
      </div>
    </ContentPage>
  )
}
