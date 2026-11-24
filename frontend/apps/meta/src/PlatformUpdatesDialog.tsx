import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
  resolvePlatformChangelog, type PlatformChangelogFile, type PlatformTarget,
} from '@gamemap/ui'
import { FooterShore } from './FooterShore'
import { updatesByDate } from './updatesByDate'
import raw from './platform-changelog.json'

const TARGET_KEYS: Record<PlatformTarget, string> = {
  aion2: 'site.aion2.name',
  gmzz: 'site.gmzz.name',
  oss: 'site.oss.name',
  glimmith: 'site.glimmith.name',
  palworld: 'site.palworld.name',
  pbz: 'site.pbz.name',
  ro3: 'site.ro3.name',
  sts2: 'site.sts2.name',
  vrising: 'site.vrising.name',
}

export function PlatformUpdatesDialog({ linked, onDismissLink }: { linked: boolean; onDismissLink: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={linked || open} onOpenChange={next => {
      setOpen(next)
      if (!next && linked) onDismissLink()
    }}>
      <DialogTrigger asChild><button type="button">{t('footer.updateHistory')}</button></DialogTrigger>
      <DialogContent
        className="footer-dialog h-[min(42rem,calc(100dvh-2rem))] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden pb-0"
        closeButtonProps={{ 'aria-label': t('footerDialogs.close') }}
      >
        <div className="footer-about-hero items-center">
          <span className="footer-about-sun" aria-hidden="true" />
          <DialogTitle className="arkive-dialog-title">{t('footer.updateHistory')}</DialogTitle>
          <DialogDescription className="sr-only">{t('platformUpdates.title')}</DialogDescription>
        </div>
        <UpdateTimeline />
        <FooterShore />
      </DialogContent>
    </Dialog>
  )
}

function UpdateTimeline() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const entries = useMemo(() => resolvePlatformChangelog(raw as PlatformChangelogFile, locale), [locale])
  const [mode, setMode] = useState<'all' | 'day' | 'range'>('all')
  const [day, setDay] = useState(entries[0]?.date ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const start = mode === 'day' ? day : mode === 'range' ? from : ''
  const end = mode === 'day' ? day : mode === 'range' ? to : ''
  const invalid = Boolean(start && end && end < start)
  const days = useMemo(() => updatesByDate(entries, start, end), [entries, start, end])
  const inputClass = 'min-w-0 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground'

  return <>
    <div className="space-y-3 border-b border-border py-3">
      <div className="inline-flex gap-1 rounded-full bg-muted p-1" role="group" aria-label={t('platformUpdates.date')}>
        {(['all', 'day', 'range'] as const).map(option => (
          <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)}
            className="min-h-8 rounded-full px-3 text-sm text-muted-foreground aria-pressed:bg-background aria-pressed:font-semibold aria-pressed:text-foreground aria-pressed:shadow-sm">
            {t(`platformUpdates.${option}`)}
          </button>
        ))}
      </div>
      {mode === 'day' && <label className="grid gap-1 text-xs text-muted-foreground">
        {t('platformUpdates.date')}
        <input type="date" className={inputClass} value={day} onChange={e => setDay(e.target.value)} />
      </label>}
      {mode === 'range' && <div className="grid grid-cols-2 gap-2">
        <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
          {t('platformUpdates.start')}
          <input type="date" className={inputClass} value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} />
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-muted-foreground">
          {t('platformUpdates.end')}
          <input type="date" className={inputClass} value={to} min={from || undefined} aria-invalid={invalid} onChange={e => setTo(e.target.value)} />
        </label>
      </div>}
    </div>
    <div key={JSON.stringify([mode, start, end])} className="min-h-0 overflow-y-auto overscroll-contain pt-3" tabIndex={0} role="region" aria-label={t('platformUpdates.title')}>
      {!invalid && days.length > 0 && (mode !== 'day' || day) ? <ol className="space-y-5">
        {days.map(([date, changes]) => (
          <li key={date}>
            <h3 className="flex items-center gap-2 text-sm font-bold tabular-nums">
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              <time dateTime={date}>{date}</time>
            </h3>
            <ul className="ml-1 mt-2 space-y-3 border-l border-border pl-4">
              {changes.map(({ key, kind, text, targets }) => (
                <li key={key} className="space-y-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{t(`platformUpdates.kinds.${kind}`)}</span>
                    <span aria-label={t('platformUpdates.affected')}>{targets.map(target => t(TARGET_KEYS[target])).join(' · ')}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{text}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol> : <p className="py-5 text-center text-sm text-muted-foreground" role="status">
        {t(invalid ? 'platformUpdates.invalidRange' : 'platformUpdates.empty')}
      </p>}
    </div>
  </>
}
