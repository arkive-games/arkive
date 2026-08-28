import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { getGameVersion } from '../../lib/urls'

const SECTIONS = [
  { to: '/traintrade', titleKey: 'trainTrade.title', bodyKey: 'trainTrade.description' },
  { to: '/utopia', titleKey: 'utopianTheater.title', bodyKey: 'utopianTheater.description' },
] as const

export default function HomePage() {
  const { t } = useTranslation()
  const gameVersion = getGameVersion()

  return (
    <ContentPage active="/" title={t('siteTitle')}>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold">{t('siteTitle')}</h1>
          <p className="mt-1 text-muted-foreground">{t('home.tagline')}</p>
        </div>

        {/* Only the sections that exist are linked. A grid of tiles promising
            pages that are not built is worse than a short honest list. */}
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((section) => (
            <Link
              key={section.to}
              to={section.to}
              className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/60"
            >
              <span className="font-semibold">{t(section.titleKey)}</span>
              <span className="text-sm text-muted-foreground">{t(section.bodyKey)}</span>
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link to="/traintrade">{t('home.browse')}</Link>
          </Button>
        </div>

        {gameVersion ? (
          <p className="text-xs text-muted-foreground">{t('home.dataNote', { version: gameVersion })}</p>
        ) : null}
      </div>
    </ContentPage>
  )
}
