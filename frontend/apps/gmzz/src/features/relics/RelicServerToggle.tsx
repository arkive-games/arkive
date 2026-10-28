import { IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { useRelicServer } from '@/features/relics/useRelicServer'
import type { RelicServer } from '@/features/relics/data'

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
        <span className="gz-tip" tabIndex={0} role="img" data-tip={hint} aria-label={hint} data-testid={`${testId}-hint`}>
          <IconInfoCircle stroke={1.8} aria-hidden />
        </span>
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
