import { useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import type { Labels } from '../../lib/wiki'
import { DetailHeader, ListControls, matches, optionsOf, PageState, Prose, Section, Tag, WikiImage, useWiki } from './shared'

/**
 * Area display names. The gallery files enemies under area keys that differ in case from
 * the map table, and under several keys the game names alike (Pangzhen and its back
 * streets), so areas are grouped and filtered by the displayed name.
 */
function useAreaOf(labels: Labels | undefined) {
  return useMemo(() => {
    const lower = new Map(Object.entries(labels?.map ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    return (key: string) => lower.get(key.toLowerCase()) || key
  }, [labels])
}

export function EnemyListPage() {
  const { t } = useTranslation()
  const { data, labels, error } = useWiki('enemies')
  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [maps, setMaps] = useState<string[]>([])
  const [bossOnly, setBossOnly] = useState<string[]>([])

  const areaOf = useAreaOf(labels)
  const rows = useMemo(() => (data?.rows ?? []).filter((e) =>
    (!types.length || types.includes(e.type))
    && (!maps.length || maps.includes(areaOf(e.map)))
    && (!bossOnly.length || e.boss)
    && matches(query, data?.text[e.id]?.name),
  ), [data, types, maps, bossOnly, query, areaOf])

  // The gallery's own order: by area as the story reaches it, then the area's list.
  const groups = useMemo(() => {
    const byMap = new Map<string, typeof rows>()
    for (const e of rows) byMap.set(areaOf(e.map), [...(byMap.get(areaOf(e.map)) ?? []), e])
    for (const list of byMap.values()) list.sort((a, b) => a.order - b.order)
    return [...byMap.entries()]
  }, [rows, areaOf])

  return (
    <ContentPage active="/enemies" title={labels?.section.enemies ?? t('nav.enemies')} heading wide>
      <PageState error={error} loading={!data || !labels} />
      {data && labels ? (
        <>
          <ListControls
            query={query}
            onQuery={setQuery}
            count={rows.length}
            groups={[
              { label: t('wiki.type'), options: optionsOf(data.rows.map((e) => e.type), labels.enemyType), selected: types, onChange: setTypes },
              { label: t('wiki.area'), options: optionsOf(data.rows.map((e) => areaOf(e.map)), undefined), selected: maps, onChange: setMaps },
              { label: t('wiki.boss'), options: [{ value: 'boss', label: t('wiki.bossOnly') }], selected: bossOnly, onChange: setBossOnly, toggle: true },
            ]}
          />
          <div className="flex flex-col gap-6">
            {groups.map(([map, list]) => (
              <section key={map}>
                <h2 className="mb-2 text-base font-semibold text-muted-foreground">{map}</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {list.map((e) => (
                    <Link
                      key={e.id}
                      to="/enemies/$id"
                      params={{ id: e.id }}
                      data-testid="wiki-tile"
                      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:border-primary/60"
                    >
                      <WikiImage name={e.bust || e.picture} contain={false} className="aspect-[3/4] w-full" />
                      <span className="flex items-center justify-between gap-1 p-2">
                        <span className="line-clamp-2 text-xs font-medium leading-tight">{data.text[e.id]?.name ?? e.id}</span>
                        {e.boss ? <Tag rarity="Legendary">{t('wiki.boss')}</Tag> : null}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </ContentPage>
  )
}

export function EnemyDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams({ strict: false }) as { id: string }
  const { data, labels, error } = useWiki('enemies')
  const areaOf = useAreaOf(labels)
  const enemy = data?.byId.get(id)
  const text = enemy ? data?.text[enemy.id] : undefined
  const name = text?.name ?? id

  return (
    <ContentPage active="/enemies" title={name}>
      <PageState error={error} loading={!data || !labels} missing={!!data && !enemy} />
      {enemy && labels ? (
        <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_1fr]">
          <WikiImage name={enemy.picture || enemy.bust} className="w-full rounded-lg border border-border bg-muted/40" />
          <div className="flex flex-col gap-4">
            <DetailHeader
              name={name}
              tags={<>
                <Tag>{labels.enemyType[enemy.type]}</Tag>
                {enemy.boss ? <Tag rarity="Legendary">{t('wiki.boss')}</Tag> : null}
                {enemy.map ? <Tag>{areaOf(enemy.map)}</Tag> : null}
              </>}
            />
            <Section title={t('wiki.description')}><Prose text={text?.desc} /></Section>
            {enemy.boss ? (
              <Link to="/" search={{ q: name }} className="text-sm text-primary hover:underline">{t('wiki.findOnMap')}</Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </ContentPage>
  )
}
