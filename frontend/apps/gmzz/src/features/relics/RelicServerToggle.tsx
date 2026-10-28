import { useTranslation } from 'react-i18next'

import { useRelicServer } from '@/features/relics/useRelicServer'
import type { RelicServer } from '@/features/relics/data'
import { Tip } from '@/features/score/Tip'

const SERVERS: RelicServer[] = ['local', 'cross']

/**
 * The 本服 / 战略服 switch, bound to the stored relic draft, drawn as a
 * segmented pill in the score page's rail. The explanation sits in the info
 * mark's tooltip beside the label, as 技能等级's does.
 */
export default function RelicServerToggle({ testId }: { testId: string }) {
  const { t } = useTranslation()
  const [server, setServer] = useRelicServer()
  const hint = t('relic.serverHint')

  return (
    <div className="gz-field">
      <span className="flex items-center gap-1">
        {t('relic.server')}
        <Tip kind="info" content={hint} title={t('relic.server')} testId={`${testId}-hint`} />
      </span>
      <div className="gz-seg full" role="group" aria-label={t('relic.server')}>
        {SERVERS.map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={entry === server}
            onClick={() => setServer(entry)}
            className="gz-chip"
            data-testid={`${testId}-${entry}`}
          >
            {t(entry === 'local' ? 'relic.serverLocal' : 'relic.serverCross')}
          </button>
        ))}
      </div>
    </div>
  )
}
