import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import { NAV_GROUPS, type NavEntry, type NavKey } from '../../components/navGroups'
import { RES_BASE } from '../../lib/urls'
import bannerArt from '../../assets/home-banner-score.jpg'

/** Each tool takes the colour of its own icon, so the three read apart at a glance. */
const TOOL_TINT = ['72 150 160', '230 164 23', '214 70 70']
/** The chess mode sits with the tools in the same tinted-card language, in violet. */
const CHESS_TINT = '124 96 214'
/** The wiki column leads with the characters, the pages players open most. */
const WIKI_ORDER: NavKey[] = ['/fellows', '/secretpartners', '/traintrade', '/managedtrade', '/utopia', '/reforge']

function group(key: string): NavEntry[] {
  return NAV_GROUPS.find((g) => g.key === key)?.children ?? []
}

function tint(c: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(135deg, rgb(${c} / 0.16), rgb(${c} / 0.05) 70%)`,
    boxShadow: `inset 0 0 0 1px rgb(${c} / 0.22)`,
  }
}

const art = (entry: NavEntry) => `${RES_BASE}/${entry.art}.webp`

/**
 * The home page is the nav, laid out: tools and the chess mode on the left,
 * the wiki on the right, all drawn from the menu list so a page added to a menu
 * appears here without a second edit. One featured tool gets the banner.
 */
export default function HomePage() {
  const { t } = useTranslation()
  const tools = group('tools')
  const chess = group('autochess')
  const wiki = [...group('wiki')].sort((a, b) => WIKI_ORDER.indexOf(a.key) - WIKI_ORDER.indexOf(b.key))

  // The banner sits on a fixed dark photo, so its colours stay the same in both themes on purpose.
  const banner = (
    <section
      aria-label={t('nav.score')}
      className="relative isolate h-[clamp(6rem,7.3vw,12.5rem)] shrink-0 overflow-hidden bg-[#16252a] text-white"
    >
      <img
        src={bannerArt}
        alt=""
        className="absolute inset-0 -z-10 size-full object-cover object-[62%_45%] md:object-[50%_45%]"
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(14_22_26/0.88)_0,rgb(14_22_26/0.6)_45%,rgb(14_22_26/0.15)_75%)] md:bg-[linear-gradient(90deg,rgb(14_22_26/0.82)_0,rgb(14_22_26/0.45)_32%,transparent_55%)]" />
      <div className="mx-auto flex h-full w-full max-w-[var(--arkive-content-standard)] items-center gap-3 px-[var(--arkive-page-gutter)] md:gap-6">
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight tracking-tight md:text-2xl">{t('nav.score')}</p>
          <p className="mt-0.5 text-xs text-white/80 md:mt-1 md:text-sm">{t('home.bannerDesc')}</p>
        </div>
        <Link
          to="/score"
          className="group ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#f6f1e6] px-3.5 text-sm font-extrabold text-[#1d2427] md:h-10 md:px-5 md:text-base"
        >
          {t('home.bannerCta')}
          <ArrowRight className="size-4 transition-transform duration-500 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  )

  return (
    <ContentPage active="/" title={t('siteTitle')} hero={banner}>
      <h1 className="sr-only">{t('siteTitle')}</h1>
      <div className="grid gap-6 pb-2 md:grid-cols-[minmax(0,1fr)_15rem] md:pb-8 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-10">
        <section aria-labelledby="home-tools">
          <h2 id="home-tools" className="mb-2.5 text-lg font-extrabold md:mb-3.5 md:text-xl">{t('nav.tools')}</h2>
          <div className="grid grid-cols-3 gap-2 md:gap-3.5">
            {tools.map((entry, i) => {
              const c = TOOL_TINT[i % TOOL_TINT.length]
              return (
                <Link
                  key={entry.key}
                  to={entry.key}
                  style={tint(c)}
                  className="group relative isolate flex flex-col items-center justify-end gap-1.5 overflow-hidden rounded-2xl bg-card px-1 pb-3 pt-2.5 text-center transition-transform duration-500 hover:-translate-y-0.5 md:rounded-3xl md:px-3 lg:min-h-33 lg:flex-row lg:items-end lg:justify-start lg:px-5 lg:pb-4.5 lg:text-left"
                >
                  <span
                    className="grid size-14 place-items-center rounded-full md:size-18 lg:absolute lg:-top-1.5 lg:-right-2.5 lg:-z-10 lg:size-28"
                    style={{ background: `radial-gradient(closest-side, rgb(${c} / 0.35), transparent)` }}
                  >
                    <img src={art(entry)} alt="" className="size-11 object-contain transition-transform duration-700 group-hover:-rotate-6 group-hover:scale-105 md:size-14 lg:size-21" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-balance text-xs font-extrabold leading-tight md:text-sm lg:text-base lg:leading-snug">{t(entry.labelKey)}</strong>
                    {entry.descKey ? <small className="mt-0.5 hidden text-sm text-muted-foreground lg:block">{t(entry.descKey)}</small> : null}
                  </span>
                </Link>
              )
            })}
          </div>

          {/* One destination; its five parts only preview what is inside. */}
          <Link
            to="/autochess"
            style={tint(CHESS_TINT)}
            className="group mt-2 block rounded-2xl bg-card px-2.5 pb-3 pt-3.5 transition-transform duration-500 hover:-translate-y-0.5 md:mt-3.5 md:rounded-3xl md:px-6 md:pb-5 md:pt-5.5"
          >
            <span className="block px-1 md:px-0">
              <strong className="block text-lg font-extrabold leading-snug md:text-xl">{t('nav.autochess')}</strong>
              <small className="mt-0.5 block text-xs text-muted-foreground md:text-sm">{t('home.desc.autochess')}</small>
            </span>
            <span className="mt-2.5 grid grid-cols-5 gap-1 md:mt-4 md:gap-2 lg:gap-2.5">
              {chess.map((entry) => (
                <span
                  key={entry.key}
                  className="flex min-w-0 flex-col items-center gap-1 overflow-hidden rounded-xl bg-card pb-1.5 pt-2 text-center text-xs font-bold leading-tight tracking-tight hyphens-auto md:gap-1.5 md:tracking-normal md:rounded-2xl md:pb-2.5 md:pt-3 lg:text-sm"
                  style={{ boxShadow: `0 0 0 1px rgb(${CHESS_TINT} / 0.14)` }}
                >
                  <img src={art(entry)} alt="" className="size-8 object-contain transition-transform duration-700 group-hover:-translate-y-0.5 md:size-12" />
                  {t(entry.labelKey)}
                </span>
              ))}
            </span>
          </Link>
        </section>

        <section aria-labelledby="home-wiki">
          <h2 id="home-wiki" className="mb-2.5 text-lg font-extrabold md:mb-3.5 md:text-xl">{t('nav.wiki')}</h2>
          <ul className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-1">
            {wiki.map((entry) => (
              <li key={entry.key}>
                <Link
                  to={entry.key}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card py-1.5 pl-1.5 pr-2.5 transition-colors md:-ml-2 md:gap-3 md:rounded-2xl md:border-transparent md:bg-transparent md:py-2 md:pl-2 md:hover:bg-accent"
                >
                  <img src={art(entry)} alt="" className="size-9 shrink-0 rounded-lg bg-muted object-contain p-1 md:size-13 md:rounded-xl md:p-1.5" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm font-extrabold md:font-bold">{t(entry.labelKey)}</strong>
                    {entry.descKey ? <small className="hidden truncate text-xs text-muted-foreground md:block">{t(entry.descKey)}</small> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ContentPage>
  )
}
