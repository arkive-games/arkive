import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { IconArrowLeft, IconExternalLink, IconHistory } from '@tabler/icons-react'
import {
  resolvePlatformChangelog,
  type PlatformChangelogFile,
  type PlatformTarget,
} from '@gamemap/ui'
import { IS_TOY } from './sites'
import raw from './platform-changelog.json'

const REPO_URL = 'https://github.com/arkive-games/arkive'
const changelog = raw as PlatformChangelogFile

const TARGET_KEYS: Record<PlatformTarget, string> = {
  aion2: 'site.aion2.name',
  palworld: 'site.palworld.name',
  ro3: 'site.ro3.name',
  sts2: 'site.sts2.name',
  vrising: 'site.vrising.name',
}

export function PlatformUpdatesPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en-US'
  const entries = useMemo(() => resolvePlatformChangelog(changelog, locale), [locale])

  return (
    <main className="arkive-content-page home-shell min-h-[60dvh] pb-12">
      <header className="max-w-[72ch] border-b border-border pb-6">
        <a
          href="#top"
          className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" stroke={1.8} aria-hidden="true" />
          {t('platformUpdates.back')}
        </a>
        <div className="mt-4 flex items-center gap-3">
          <IconHistory className="size-6 shrink-0 text-primary" stroke={1.8} aria-hidden="true" />
          <h1 className="text-2xl font-bold leading-tight">{t('platformUpdates.title')}</h1>
        </div>
      </header>

      <ol className="relative mt-8 max-w-[72ch]" aria-label={t('platformUpdates.title')}>
        {entries.map((entry, index) => (
          <li
            key={entry.commit}
            data-testid="platform-update-entry"
            className={index === entries.length - 1 ? 'relative pl-8' : 'relative pb-8 pl-8'}
          >
            {index !== entries.length - 1 ? (
              <span aria-hidden="true" className="absolute -bottom-2 left-1.5 top-2 w-px -translate-x-1/2 bg-border" />
            ) : null}
            <span
              aria-hidden="true"
              className={index === 0
                ? 'absolute left-0 top-2 size-3 rounded-full border-2 border-primary bg-background'
                : 'absolute left-0 top-2 size-3 rounded-full border-2 border-border bg-background'}
            />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <time dateTime={entry.date} className="font-mono text-sm font-semibold text-foreground">
                {entry.date}
              </time>
              {/* A toy is a sealed directory on bilibili.com: off-platform links
                  are omitted there, the same way brand.ts nulls the repository
                  and ICP links. The SHA itself still identifies the release. */}
              {IS_TOY ? (
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.commit.slice(0, 7)}
                </span>
              ) : (
                <a
                  href={`${REPO_URL}/commit/${entry.commit}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${t('platformUpdates.viewCommit')} ${entry.commit.slice(0, 7)}`}
                  className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {entry.commit.slice(0, 7)}
                  <IconExternalLink className="size-3" stroke={1.8} aria-hidden="true" />
                </a>
              )}
            </div>

            <ul className="mt-3 space-y-2">
              {entry.changes.map((change, changeIndex) => (
                <li key={changeIndex} className="flex flex-wrap items-baseline gap-2 text-sm leading-relaxed">
                  <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {t(`platformUpdates.kinds.${change.kind}`)}
                  </span>
                  <span className="min-w-0 flex-1">{change.text}</span>
                </li>
              ))}
            </ul>

            <div
              role="group"
              className="mt-3 flex flex-wrap items-center gap-1.5"
              aria-label={t('platformUpdates.affected')}
            >
              {entry.targets.map((target) => (
                <span key={target} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {t(TARGET_KEYS[target])}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </main>
  )
}
