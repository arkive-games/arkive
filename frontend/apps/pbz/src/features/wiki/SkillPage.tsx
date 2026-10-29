import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import type { SkillNode } from '../../lib/wiki'
import { Cost, PageState, Prose, WikiImage, useItemNames, useWiki } from './shared'

/** The three branches, top to bottom as the game's ability screen lays them out. */
const BRANCHES = ['HeiShi', 'ShaChiHupo', 'MemoryFlower'] as const

/**
 * The ability tree. Each branch is a row of nodes unlocked left to right; the
 * Banyan nodes sit between two branches and need a node from each (their
 * `parents`). The page lists rows in that order rather than drawing the graph,
 * so it reads the same on a phone.
 */
export default function SkillPage() {
  const { t } = useTranslation()
  const { data, labels, error } = useWiki('skills')
  const names = useItemNames()

  const rows = useMemo(() => {
    const nodes = data?.rows ?? []
    const byColumn = (list: SkillNode[]) => [...list].sort((a, b) => a.column - b.column)
    return [
      { key: 'top', nodes: byColumn(nodes.filter((n) => n.branch === 'Banyan' && n.row === 'top')) },
      ...BRANCHES.map((b) => ({ key: b, nodes: byColumn(nodes.filter((n) => n.branch === b)) })),
      { key: 'bottom', nodes: byColumn(nodes.filter((n) => n.branch === 'Banyan' && n.row === 'bottom')) },
    ]
  }, [data])

  const nodeName = (id: string) => data?.text[id]?.name ?? id

  return (
    <ContentPage active="/skills" title={t('nav.skills')} heading wide>
      <PageState error={error} loading={!data || !labels} />
      {data && labels ? (
        <div className="flex flex-col gap-6">
          {rows.map(({ key, nodes }) => (
            <section key={key}>
              <h2 className="mb-2 text-base font-semibold text-muted-foreground">
                {key === 'top' || key === 'bottom' ? labels.skillBranch.Banyan : labels.skillBranch[key]}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {nodes.map((n) => (
                  <div
                    key={n.id}
                    id={n.id}
                    className={cn('flex gap-3 rounded-lg border bg-card p-3', n.ultimate ? 'border-amber-500/60' : 'border-border')}
                  >
                    <WikiImage name={n.icon} className="size-12 shrink-0" />
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold">{nodeName(n.id)}</span>
                        {n.maxLevel > 1 ? <span className="text-xs text-muted-foreground">{t('wiki.maxLevel', { count: n.maxLevel })}</span> : null}
                      </div>
                      <Prose text={data.text[n.id]?.desc} prompts={labels.prompt} />
                      {n.parents.length ? (
                        <span className="text-xs text-muted-foreground">
                          {t('wiki.requires')}{' '}
                          {n.parents.map((p, i) => (
                            <span key={p}>{i ? ' + ' : ''}<a href={`#${p}`} className="hover:underline">{nodeName(p)}</a></span>
                          ))}
                        </span>
                      ) : null}
                      {n.dust || n.materials.length ? (
                        <span className="text-xs"><Cost dust={n.dust} materials={n.materials} names={names} /></span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </ContentPage>
  )
}
