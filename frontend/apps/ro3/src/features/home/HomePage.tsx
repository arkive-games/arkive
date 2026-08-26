import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Button } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { SiteInfo } from '../../components/SiteInfo'

/**
 * Landing page.
 *
 * Deliberately says what the site does and does not have yet rather than
 * showing empty section tiles: Ragnarok Online 3 encrypts its bundle payloads,
 * so no game data has been extracted, and a grid of dead links would misreport
 * that. Sections get added here as the pipeline starts producing data.
 */
export default function HomePage() {
  const { t } = useTranslation()

  return (
    <ContentPage active="/" title={t('siteTitle')} heading>
      <div className="space-y-6">
        <p className="text-lg text-muted-foreground">{t('home.tagline')}</p>
        <p className="text-sm text-muted-foreground">{t('home.comingSoon')}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/changelog">{t('changelog.title')}</Link>
          </Button>
        </div>
        <SiteInfo />
      </div>
    </ContentPage>
  )
}
