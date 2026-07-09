import { useTranslation } from 'react-i18next'
import { ShellTopBar, ThemeToggle } from '@gamemap/map-shell'
import { Card, cn } from '@gamemap/ui'
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
              className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card
                className={cn(
                  'h-full gap-4 py-6 transition-colors',
                  'group-hover:border-accent group-hover:bg-secondary',
                )}
              >
                <div className="flex flex-col items-center gap-4 px-6 text-center">
                  <div className="flex size-24 items-center justify-center rounded-xl bg-slate-800 p-3">
                    <img
                      src={site.logo}
                      alt={t(site.nameKey)}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold">{t(site.nameKey)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{t(site.descKey)}</p>
                  </div>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent">
                    {t('action.open')}
                    <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </Card>
            </a>
          ))}
        </div>
      </main>
    </div>
  )
}
