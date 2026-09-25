import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import { NAV_GROUPS } from '../../components/navGroups'
import { RES_BASE } from '../../lib/urls'

/**
 * The home page is the nav, laid out: the same three sections drawn from the
 * same list, so a page added to a menu appears here without a second edit.
 *
 * Built to fit one screen. This is a tool site, and a visitor arrives to go
 * somewhere, so every entry is a picture and a name — no description to read
 * past, no banner above the fold. On desktop the three sections sit side by
 * side; on a phone they stack, still as tiles.
 */
export default function HomePage() {
  const { t } = useTranslation()

  return (
    <ContentPage active="/" title={t('siteTitle')} wide>
      <div className="flex flex-col gap-4">
        {/* Desktop only: on a phone the mobile header already names the site,
            and repeating it pushed the last section under the tab strip. */}
        <div className="hidden flex-wrap items-baseline gap-x-3 gap-y-1 md:flex">
          <h1 className="text-3xl font-bold">{t('siteTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('home.tagline')}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[3fr_4fr_5fr]">
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon
            return (
              <section
                key={group.key}
                aria-labelledby={`home-${group.key}`}
                className="rounded-lg border border-border bg-card p-3 shadow-sm"
              >
                <h2 id={`home-${group.key}`} className="mb-2 flex items-center gap-1.5 px-1 text-base font-semibold">
                  <GroupIcon className="size-4 text-[color:var(--arkive-nav-active)]" strokeWidth={2} aria-hidden />
                  {t(group.labelKey)}
                </h2>
                {/* Columns follow the entry count on desktop, so every section
                    is exactly one row of tiles and the three end level. */}
                <div
                  className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:[grid-template-columns:repeat(var(--home-cols),minmax(0,1fr))]"
                  style={{ ['--home-cols' as string]: group.children.length }}
                >
                  {group.children.map((entry) => (
                    <Link
                      key={entry.key}
                      to={entry.key}
                      className="group flex flex-col items-center gap-1.5 rounded-md px-1 py-2 text-center transition-colors hover:bg-accent"
                    >
                      <img
                        src={`${RES_BASE}/${entry.art}.webp`}
                        alt=""
                        loading="lazy"
                        className="size-14 rounded-md object-contain transition-transform group-hover:scale-105"
                      />
                      <span className="line-clamp-2 text-xs font-medium leading-tight">{t(entry.labelKey)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </ContentPage>
  )
}
