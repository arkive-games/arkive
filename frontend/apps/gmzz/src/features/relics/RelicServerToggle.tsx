import { Hint, TooltipProvider } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { TYPE } from '@/lib/typography'
import { useRelicServer } from '@/features/relics/memory'
import type { RelicServer } from '@/features/relics/data'

const SERVERS: RelicServer[] = ['local', 'cross']

/**
 * The 本服 / 战略服 switch, bound to the stored relic draft. `compact` lays it
 * out on one line for the page's sticky title bar, with the explanation in a
 * tooltip on the label instead of a paragraph underneath.
 */
export default function RelicServerToggle({ testId, hint = true, compact = false }: { testId: string; hint?: boolean; compact?: boolean }) {
  const { t } = useTranslation()
  const [server, setServer] = useRelicServer()

  return (
    <div className={compact ? 'flex min-w-0 items-center gap-2' : 'min-w-0'}>
      {compact ? (
        <TooltipProvider delayDuration={200}>
          <Hint content={t('relic.serverHint')} title={t('relic.server')} contentClassName="max-w-xs">
            <span className={`cursor-help underline decoration-dotted underline-offset-4 ${TYPE.label}`} tabIndex={0}>{t('relic.server')}</span>
          </Hint>
        </TooltipProvider>
      ) : (
        <span className={`mb-0.5 block ${TYPE.label}`}>{t('relic.server')}</span>
      )}
      <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label={t('relic.server')}>
        {SERVERS.map((entry, index) => (
          <button
            key={entry}
            type="button"
            aria-pressed={entry === server}
            onClick={() => setServer(entry)}
            className={`inline-flex min-h-9 items-center px-3 ${TYPE.control} font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${index > 0 ? 'border-l border-border' : ''} ${
              entry === server
                ? 'bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
            data-testid={`${testId}-${entry}`}
          >
            {t(entry === 'local' ? 'relic.serverLocal' : 'relic.serverCross')}
          </button>
        ))}
      </div>
      {hint && !compact ? <p className="mt-0.5 max-w-sm text-xs leading-5 text-muted-foreground">{t('relic.serverHint')}</p> : null}
    </div>
  )
}
