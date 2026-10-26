import { useTranslation } from 'react-i18next'

import { TYPE } from '@/lib/typography'
import { useRelicServer } from '@/features/relics/memory'
import type { RelicServer } from '@/features/relics/data'

const SERVERS: RelicServer[] = ['local', 'cross']

/**
 * The 本服 / 战略服 switch. Rendered twice — at the top of the page and in the
 * relic section — and bound to one stored value, so the two never disagree.
 */
export default function RelicServerToggle({ testId, hint = true }: { testId: string; hint?: boolean }) {
  const { t } = useTranslation()
  const [server, setServer] = useRelicServer()

  return (
    <div className="min-w-0">
      <span className={`mb-0.5 block ${TYPE.label}`}>{t('relic.server')}</span>
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
      {hint ? <p className="mt-0.5 max-w-sm text-xs leading-5 text-muted-foreground">{t('relic.serverHint')}</p> : null}
    </div>
  )
}
