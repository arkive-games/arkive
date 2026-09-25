import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ContentPage } from '@/components/ContentPage'
import {
  loadAutoChessBonds,
  loadAutoChessPieces,
  plainText,
  type AutoChessBondGroup,
} from '@/features/autochess/data'
import { Chip, FilterBar, FilterRow } from '@/components/Filters'
import { useRemoteData } from '@/lib/useRemoteData'

/**
 * The three families, in the order the in-game help lists them. Derived in the
 * pipeline from the client's `Priority` band, never from `Type` — see
 * `tools/apps/gmzz/autochess.py`.
 */
const GROUPS: AutoChessBondGroup[] = ['role', 'faction', 'special']

export default function AutoChessBondsPage() {
  const { t } = useTranslation()
  const bonds = useRemoteData(loadAutoChessBonds)
  const pieces = useRemoteData(loadAutoChessPieces)
  const [group, setGroup] = useState<AutoChessBondGroup | ''>('')

  useEffect(() => {
    document.title = `${t('autochess.bonds.title')} - ${t('siteTitle')}`
  }, [t])

  /** Which pieces carry each bond — the question a player actually has. */
  const membersByBond = useMemo(() => {
    const map = new Map<number, { baseId: number; name: string; cost: number }[]>()
    for (const piece of pieces.data ?? []) {
      for (const id of piece.bondIds) {
        const list = map.get(id) ?? []
        list.push({ baseId: piece.baseId, name: piece.name, cost: piece.cost })
        map.set(id, list)
      }
    }
    for (const list of map.values()) list.sort((a, b) => a.cost - b.cost || a.name.localeCompare(b.name))
    return map
  }, [pieces.data])

  const all = bonds.data ?? []
  const shown = group ? all.filter((bond) => bond.group === group) : all

  if (bonds.error || pieces.error) {
    return (
      <ContentPage active="/autochess/bonds" title={t('autochess.bonds.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('autochess.loadError')}</p>
      </ContentPage>
    )
  }
  if (bonds.loading || pieces.loading) {
    return (
      <ContentPage active="/autochess/bonds" title={t('autochess.bonds.title')} heading wide>
        <p className="text-sm text-muted-foreground">{t('loading')}</p>
      </ContentPage>
    )
  }

  return (
    <ContentPage active="/autochess/bonds" title={t('autochess.bonds.title')} heading wide>
      <FilterBar>
        <FilterRow label={t('autochess.bonds.groupFilter')}>
          <Chip active={group === ''} onClick={() => setGroup('')}>
            {t('autochess.all')}
            <span className="ml-1 text-xs opacity-70">{all.length}</span>
          </Chip>
          {GROUPS.map((value) => (
            <Chip key={value} active={group === value} onClick={() => setGroup(value)}>
              {t(`autochess.bonds.group.${value}`)}
              <span className="ml-1 text-xs opacity-70">
                {all.filter((bond) => bond.group === value).length}
              </span>
            </Chip>
          ))}
        </FilterRow>
      </FilterBar>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((bond) => {
          const members = membersByBond.get(bond.id) ?? []
          return (
            <article key={bond.id} className="rounded-md border border-border bg-card p-3">
              <header className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-base font-semibold">{bond.name}</h2>
                <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                  {t(`autochess.bonds.group.${bond.group}`)}
                </span>
              </header>

              <p className="mt-1 text-sm text-muted-foreground">{plainText(bond.description)}</p>

              <ol className="mt-2 space-y-1">
                {bond.tiers.map((tier) => (
                  <li key={tier.activateNum} className="flex gap-2 text-sm">
                    <span className="mt-px shrink-0 rounded border border-border px-1.5 text-xs tabular-nums text-muted-foreground">
                      {t('autochess.bonds.activateNum', { count: tier.activateNum })}
                    </span>
                    <span className="text-muted-foreground">{plainText(tier.description)}</span>
                  </li>
                ))}
              </ol>

              {members.length ? (
                // Laid out rather than joined: a literal separator in the code
                // is one locale's punctuation imposed on all three — `、` reads
                // as a stray glyph in English. Spacing is the stylesheet's job.
                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 border-t border-border/70 pt-1.5 text-xs text-muted-foreground">
                  <span className="font-medium">{t('autochess.bonds.members', { count: members.length })}</span>
                  {members.map((member) => (
                    <span key={member.baseId} className="tabular-nums">{member.name}({member.cost})</span>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </ContentPage>
  )
}
