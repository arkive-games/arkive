import { useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import { RARITIES } from '../../lib/wiki'
import {
  Cost, DetailHeader, ListControls, matches, optionsOf, PageState, Prose, Row, Section, Tag, Tile, TileGrid,
  useItemNames, useWiki,
} from './shared'

type Kind = 'weapons' | 'phantomEdges'
const ROUTE = { weapons: '/weapons', phantomEdges: '/phantom-edges' } as const
const TYPE_LABELS = { weapons: 'weaponType', phantomEdges: 'edgeType' } as const

export function WeaponListPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation()
  const { data, labels, error } = useWiki(kind)
  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [rarities, setRarities] = useState<string[]>([])

  const rows = useMemo(() => (data?.rows ?? []).filter((w) =>
    (!types.length || types.includes(w.type))
    && (!rarities.length || rarities.includes(w.rarity))
    && matches(query, data?.text[w.id]?.name),
  ), [data, types, rarities, query])

  const title = labels?.section[kind] ?? t(`nav.${kind}`)
  return (
    <ContentPage active={ROUTE[kind]} title={title} heading wide>
      <PageState error={error} loading={!data || !labels} />
      {data && labels ? (
        <>
          <ListControls
            query={query}
            onQuery={setQuery}
            count={rows.length}
            groups={[
              { label: t('wiki.type'), options: optionsOf(data.rows.map((w) => w.type), labels[TYPE_LABELS[kind]]), selected: types, onChange: setTypes },
              { label: t('wiki.rarity'), options: optionsOf(RARITIES.filter((r) => data.rows.some((w) => w.rarity === r)), labels.rarity), selected: rarities, onChange: setRarities },
            ]}
          />
          <TileGrid>
            {rows.map((w) => (
              <Tile
                key={w.id}
                to={`${ROUTE[kind]}/$id`}
                params={{ id: w.id }}
                icon={w.icon}
                name={data.text[w.id]?.name ?? w.id}
                sub={labels[TYPE_LABELS[kind]][w.type]}
                rarity={w.rarity}
              />
            ))}
          </TileGrid>
        </>
      ) : null}
    </ContentPage>
  )
}

export function WeaponDetailPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation()
  const { id } = useParams({ strict: false }) as { id: string }
  const { data, labels, error } = useWiki(kind)
  const names = useItemNames()
  const [showAll, setShowAll] = useState(false)

  const weapon = data?.byId.get(id)
  const text = weapon ? data?.text[weapon.id] : undefined
  const name = text?.name ?? id
  const levels = weapon?.levels ?? []
  const shown = showAll ? levels : levels.slice(0, 10)
  const totalDust = levels.reduce((sum, [, dust]) => sum + dust, 0)

  return (
    <ContentPage active={ROUTE[kind]} title={name}>
      <PageState error={error} loading={!data || !labels} missing={!!data && !weapon} />
      {weapon && labels ? (
        <div className="flex flex-col gap-4">
          <DetailHeader
            image={weapon.icon || weapon.render}
            name={name}
            tags={<>
              <Tag rarity={weapon.rarity}>{labels.rarity[weapon.rarity]}</Tag>
              <Tag>{labels[TYPE_LABELS[kind]][weapon.type]}</Tag>
            </>}
          >
            <Prose text={text?.flavor} muted />
          </DetailHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title={t('wiki.description')}>
              <Prose text={text?.desc} prompts={labels.prompt} />
              {text?.intro ? <div className="mt-2"><Prose text={text.intro} muted /></div> : null}
            </Section>
            {weapon.stats.length ? (
              <Section title={t('wiki.baseStats')}>
                {weapon.stats.map((value, i) => (
                  <Row key={i} label={text?.stats?.[i] ?? i}>{value}</Row>
                ))}
              </Section>
            ) : null}
          </div>

          {text?.moves?.length ? (
            <Section title={t('wiki.moves')}>
              <div className="flex flex-col gap-3">
                {text.moves.map(([title, desc], i) => (
                  <div key={i}>
                    {title ? <div className="mb-1 text-sm font-semibold">{title}</div> : null}
                    <Prose text={desc} prompts={labels.prompt} />
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {weapon.soul || text?.soul?.length ? (
            <Section title={labels.section.soulTemper}>
              <div className="flex flex-col gap-3">
                {text?.soul?.map(([title, desc], i) => (
                  <div key={i}>
                    {title ? <div className="mb-1 text-sm font-semibold">{title}</div> : null}
                    <Prose text={desc} prompts={labels.prompt} />
                  </div>
                ))}
                {weapon.soul ? (
                  <Row label={t('wiki.cost')}><Cost dust={weapon.soul.dust} materials={weapon.soul.materials} names={names} /></Row>
                ) : null}
              </div>
            </Section>
          ) : null}

          {levels.length ? (
            <Section title={t('wiki.upgrades', { count: levels.length, dust: totalDust.toLocaleString() })}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-1.5 pr-3 font-normal">{t('wiki.level')}</th>
                      <th className="py-1.5 pr-3 font-normal">{labels.section.attack}</th>
                      <th className="py-1.5 text-right font-normal">{t('wiki.cost')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map(([mult, dust, materials], i) => (
                      <tr key={i} className="border-b border-border last:border-b-0">
                        <td className="py-1.5 pr-3 tabular-nums">+{i + 1}</td>
                        <td className="py-1.5 pr-3 tabular-nums">×{mult}</td>
                        <td className="py-1.5 text-right"><Cost dust={dust} materials={materials} names={names} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {levels.length > shown.length || showAll ? (
                <button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={() => setShowAll(!showAll)}>
                  {showAll ? t('wiki.showLess') : t('wiki.showAll', { count: levels.length })}
                </button>
              ) : null}
            </Section>
          ) : null}
        </div>
      ) : null}
    </ContentPage>
  )
}
