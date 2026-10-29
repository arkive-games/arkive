import { useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import { type Materials } from '../../lib/wiki'
import { DetailHeader, ListControls, matches, optionsOf, PageState, Prose, Row, Section, Tag, Tile, TileGrid, useWiki } from './shared'

export function ItemListPage() {
  const { t } = useTranslation()
  const { data, labels, error } = useWiki('items')
  const [query, setQuery] = useState('')
  const [categories, setCategories] = useState<string[]>([])
  const rows = useMemo(() => (data?.rows ?? [])
    .filter((it) => (!categories.length || categories.includes(it.category)) && matches(query, data?.text[it.id]?.name))
    .sort((a, b) => a.order - b.order), [data, categories, query])

  return (
    <ContentPage active="/items" title={labels?.section.items ?? t('nav.items')} heading wide>
      <PageState error={error} loading={!data || !labels} />
      {data && labels ? (
        <>
          <ListControls
            query={query}
            onQuery={setQuery}
            count={rows.length}
            groups={[{ label: t('wiki.category'), options: optionsOf(data.rows.map((it) => it.category), labels.itemCategory), selected: categories, onChange: setCategories }]}
          />
          <TileGrid>
            {rows.map((it) => (
              <Tile key={it.id} to="/items/$id" params={{ id: it.id }} icon={it.icon} name={data.text[it.id]?.name ?? it.id} sub={labels.itemCategory[it.category]} />
            ))}
          </TileGrid>
        </>
      ) : null}
    </ContentPage>
  )
}

interface Use { to: string; id: string; name: string; count: number }

/** Every weapon, Phantom Edge, accessory and medicine whose upgrades consume the item. */
function useUses(itemId: string): Use[] {
  const weapons = useWiki('weapons').data
  const edges = useWiki('phantomEdges').data
  const accessories = useWiki('accessories').data
  const medicines = useWiki('medicines').data
  return useMemo(() => {
    const out: Use[] = []
    const add = (to: string, id: string, name: string | undefined, lists: Materials[]) => {
      const count = lists.flat().filter(([m]) => m === itemId).reduce((sum, [, n]) => sum + n, 0)
      if (count) out.push({ to, id, name: name ?? id, count })
    }
    for (const w of weapons?.rows ?? []) add('/weapons/$id', w.id, weapons?.text[w.id]?.name, [...w.levels.map((l) => l[2]), w.soul?.materials ?? []])
    for (const w of edges?.rows ?? []) add('/phantom-edges/$id', w.id, edges?.text[w.id]?.name, [...w.levels.map((l) => l[2]), w.soul?.materials ?? []])
    for (const a of accessories?.rows ?? []) add('/accessories/$id', a.id, accessories?.text[a.id]?.name, [...a.refine.map((l) => l[1]), ...a.cycle.map((l) => l[1])])
    for (const m of medicines?.rows ?? []) add('/medicines/$id', m.id, medicines?.text[m.id]?.name, m.levels.map((l) => l[1]))
    return out
  }, [itemId, weapons, edges, accessories, medicines])
}

export function ItemDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams({ strict: false }) as { id: string }
  const { data, labels, error } = useWiki('items')
  const item = data?.byId.get(id)
  const text = item ? data?.text[item.id] : undefined
  const name = text?.name ?? id
  const uses = useUses(id)
  const [page, setPage] = useState(0)

  return (
    <ContentPage active="/items" title={name}>
      <PageState error={error} loading={!data || !labels} missing={!!data && !item} />
      {item && labels ? (
        <div className="flex flex-col gap-4">
          <DetailHeader image={item.picture || item.icon} name={name} tags={<Tag>{labels.itemCategory[item.category]}</Tag>}>
            {item.sell ? <span className="text-sm text-muted-foreground">{t('wiki.sellPrice', { count: item.sell })}</span> : null}
          </DetailHeader>
          <div className="grid gap-4 md:grid-cols-2">
            {text?.desc || text?.use ? (
              <Section title={t('wiki.description')}>
                <Prose text={text?.desc} prompts={labels.prompt} />
                {text?.use ? <div className="mt-2"><Prose text={text.use} prompts={labels.prompt} /></div> : null}
              </Section>
            ) : null}
            {text?.lore ? <Section title={t('wiki.lore')}><Prose text={text.lore} muted /></Section> : null}
          </div>
          {text?.pages?.length ? (
            <Section title={t('wiki.pages', { count: text.pages.length })}>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {text.pages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPage(i)}
                    className={`rounded-md border px-2.5 py-1 text-xs tabular-nums ${i === page ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/60'}`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <Prose text={text.pages[Math.min(page, text.pages.length - 1)]} />
            </Section>
          ) : null}
          {uses.length ? (
            <Section title={t('wiki.usedFor')}>
              {uses.map((u) => (
                <Row key={u.to + u.id} label={<Link to={u.to} params={{ id: u.id }} className="text-foreground hover:underline">{u.name}</Link>}>
                  ×{u.count}
                </Row>
              ))}
            </Section>
          ) : null}
        </div>
      ) : null}
    </ContentPage>
  )
}
