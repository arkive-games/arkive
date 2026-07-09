import { useTranslation } from 'react-i18next'
import { ShellTopBar, ThemeToggle } from '@gamemap/map-shell'
import { ArrowUpRight } from 'lucide-react'
import { LANGUAGES, LANGUAGE_LABELS } from './i18n'
import { SITES } from './sites'

export default function App() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <ShellTopBar
        classNames={{ root: 'border-b border-border bg-card text-card-foreground' }}
        leftSlot={<span className="text-lg font-semibold tracking-tight">{t('brand')}</span>}
        languageSwitcher={{
          languages: LANGUAGES.map((code) => ({ code, label: LANGUAGE_LABELS[code] })),
          current: lng,
          onChange: (code) => void i18n.changeLanguage(code),
          menuLabel: t('language'),
        }}
        rightExtras={
          <ThemeToggle labels={{ auto: t('theme.auto'), light: t('theme.light'), dark: t('theme.dark') }} />
        }
      />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-10">
        <div className="grid gap-6 sm:grid-cols-2">
          {SITES.map((site) => (
            <a
              key={site.id}
              href={site.url}
              className="group relative block aspect-video overflow-hidden rounded-xl border border-border shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
    </div>
  )
}
