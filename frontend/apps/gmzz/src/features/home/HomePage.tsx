import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { ContentPage } from '../../components/ContentPage'
import { NAV_GROUPS } from '../../components/navGroups'
import { getGameVersion } from '../../lib/urls'

/**
 * The home page is the nav, laid out: the same three sections in the same order,
 * drawn from the same list, so a page added to a menu appears here without a
 * second edit — and one missing here is missing from the menu too.
 */
export default function HomePage() {
  const { t } = useTranslation()
  const gameVersion = getGameVersion()

  return (
    <ContentPage active="/" title={t('siteTitle')}>
      <div className="flex flex-col gap-8">
        <header className="rounded-xl border border-border bg-card px-5 py-6 shadow-sm md:px-8 md:py-8">
          <h1 className="text-3xl font-bold">{t('siteTitle')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('home.tagline')}</p>
          {gameVersion ? (
            <p className="mt-4 inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              {t('home.dataNote', { version: gameVersion })}
            </p>
          ) : null}
        </header>

        {NAV_GROUPS.map((group) => {
          const GroupIcon = group.icon
          return (
            <section key={group.key} aria-labelledby={`home-${group.key}`}>
              <div className="mb-3 flex items-center gap-2">
                <GroupIcon className="size-5 text-[color:var(--arkive-nav-active)]" strokeWidth={1.8} aria-hidden />
                <h2 id={`home-${group.key}`} className="text-lg font-semibold">
                  {t(group.labelKey)}
                </h2>
              </div>
              <p className="mb-3 text-sm text-muted-foreground">{t(group.introKey)}</p>

              {/* Four across when a section has exactly four, so it fills one
                  row rather than leaving a card stranded under three. */}
              <div
                className={
                  group.children.length === 4
                    ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'
                    : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'
                }
              >
                {group.children.map((entry) => {
                  const EntryIcon = entry.icon
                  return (
                    <Link
                      key={entry.key}
                      to={entry.key}
                      className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition hover:border-primary/60 hover:shadow"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-[color:var(--arkive-nav-active)]">
                        <EntryIcon className="size-5" strokeWidth={1.8} aria-hidden />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-center justify-between gap-2 font-semibold">
                          {t(entry.labelKey)}
                          <ChevronRight
                            className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
                            aria-hidden
                          />
                        </span>
                        <span className="text-sm text-muted-foreground">{t(entry.bodyKey)}</span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </ContentPage>
  )
}
