import { useTranslation } from 'react-i18next'
import { ShellTopBar, ThemeToggle } from '@gamemap/map-shell'
import { BuildInfo, SiteFooter } from '@gamemap/ui'
import { ArrowUpRight } from 'lucide-react'
import { LANGUAGES, LANGUAGE_LABELS } from './i18n'
import { VISIBLE_SITES, siteHref } from './sites'

/** Bilibili Toy build (see sites.ts) — a sealed same-origin /toy/<slug>/ directory. */
const IS_TOY = Boolean(import.meta.env.VITE_TOY)

export default function App() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  return (
    <div className="flex min-h-dvh flex-col text-foreground">
      <ShellTopBar
        classNames={{ root: 'sticky top-0 z-10 border-b border-border bg-card/70 text-card-foreground backdrop-blur-md' }}
        leftSlot={<span className="text-lg font-semibold tracking-tight">{t('brand')}</span>}
        languageSwitcher={{
          languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
          current: lng,
          onChange: (code) => void i18n.changeLanguage(code),
          menuLabel: t('language'),
        }}
        rightExtras={
          <>
            <ThemeToggle labels={{ auto: t('theme.auto'), light: t('theme.light'), dark: t('theme.dark') }} />
            <BuildInfo commit={__BUILD_GIT_COMMIT__} buildTime={__BUILD_TIME__} dev={import.meta.env.DEV} />
          </>
        }
      />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10">
        {/* Two columns only when there are at least two cards: a toy build shows
            just the games that have a toy, and a lone half-width card looks broken. */}
        <div
          className={
            VISIBLE_SITES.length > 1
              ? 'grid gap-6 sm:grid-cols-2'
              : 'mx-auto grid w-full max-w-xl gap-6'
          }
        >
          {VISIBLE_SITES.map((site) => (
            /* No target="_blank" in either build: a toy navigates in place
               (popping tabs out of Bilibili's own page chrome is jarring and
               unreliable), and the web portal has always done the same. */
            <a
              key={site.id}
              href={siteHref(site)}
              className="group relative block aspect-video overflow-hidden rounded-2xl border border-border shadow-xl shadow-black/25 ring-1 ring-black/5 transition-shadow duration-300 outline-none hover:shadow-2xl focus-visible:ring-2 focus-visible:ring-ring"
            >
              <img
                src={site.bg}
                alt=""
                className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {/* Dark gradient so the light text stays legible over any artwork. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25 transition-colors group-hover:from-black/80" />
              <div className="relative flex size-full flex-col justify-end gap-1 p-6 text-white">
                <h2 className="text-2xl font-semibold drop-shadow">{t(site.nameKey)}</h2>
                <p className="text-sm text-white/85 drop-shadow">{t(site.descKey)}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium">
                  {t('action.open')}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </main>

      {/* The shared SiteFooter links out to the public site, the GitHub org and
          our ICP filing. None of those belong in a toy: they all leave
          bilibili.com, and the ICP record describes OUR hosting — it says
          nothing about a page served by Bilibili, so displaying it there is
          simply wrong. The toy therefore keeps the same footer band as plain
          text. BuildInfo stays in both builds: its only link is a commit page
          tucked inside a hovercard, same as the live palworld toy ships. */}
      {IS_TOY ? (
        <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground">
          {t('brand')} © 2025-2026
        </footer>
      ) : (
        <SiteFooter
          homeUrl={import.meta.env.VITE_HOME_URL}
          githubUrl={import.meta.env.VITE_GITHUB_URL}
          icpBeian={import.meta.env.VITE_ICP_BEIAN}
        />
      )}
    </div>
  )
}
