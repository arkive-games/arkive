import { useMemo, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import {
  Cost, DetailHeader, ListControls, matches, optionsOf, PageState, Prose, Row, Section, Tag, Tile, TileGrid,
  useItemNames, useWiki,
} from './shared'

export function AccessoryListPage() {
  const { t } = useTranslation()
  const { data, labels, error } = useWiki('accessories')
  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const rows = useMemo(() => (data?.rows ?? []).filter((a) =>
    (!types.length || types.includes(a.type)) && matches(query, data?.text[a.id]?.name, data?.text[a.id]?.desc),
  ), [data, types, query])

  return (
    <ContentPage active="/accessories" title={labels?.section.accessories ?? t('nav.accessories')} heading wide>
      <PageState error={error} loading={!data || !labels} />
      {data && labels ? (
        <>
          <ListControls
            query={query}
            onQuery={setQuery}
            count={rows.length}
            groups={[{ label: t('wiki.type'), options: optionsOf(data.rows.map((a) => a.type), labels.accessoryType), selected: types, onChange: setTypes }]}
          />
          <TileGrid>
            {rows.map((a) => (
              <Tile key={a.id} to="/accessories/$id" params={{ id: a.id }} icon={a.icon} name={data.text[a.id]?.name ?? a.id} sub={labels.accessoryType[a.type]} />
            ))}
          </TileGrid>
        </>
      ) : null}
    </ContentPage>
  )
}

export function AccessoryDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams({ strict: false }) as { id: string }
  const { data, labels, error } = useWiki('accessories')
  const names = useItemNames()
  const acc = data?.byId.get(id)
  const text = acc ? data?.text[acc.id] : undefined
  const name = text?.name ?? id

  return (
    <ContentPage active="/accessories" title={name}>
      <PageState error={error} loading={!data || !labels} missing={!!data && !acc} />
      {acc && labels ? (
        <div className="flex flex-col gap-4">
          <DetailHeader image={acc.picture || acc.icon} name={name} tags={<Tag>{labels.accessoryType[acc.type]}</Tag>}>
            <Prose text={text?.intro} muted />
          </DetailHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title={t('wiki.effect')}>
              <Prose text={text?.base || text?.desc} prompts={labels.prompt} />
            </Section>
            <Section title={t('wiki.lore')}>
              <Prose text={text?.lore} muted />
            </Section>
          </div>
          {acc.refine.length ? (
            <Section title={t('wiki.polishing')}>
              <div className="flex flex-col gap-3">
                {acc.refine.map(([dust, materials], i) => (
                  <div key={i} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <div className="mb-1 text-sm font-semibold">{text?.refine?.[i]?.[0] || `+${i + 1}`}</div>
                    <Prose text={text?.refine?.[i]?.[1]} prompts={labels.prompt} />
                    <Row label={t('wiki.cost')}><Cost dust={dust} materials={materials} names={names} /></Row>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
          {acc.cycle.length ? (
            <Section title={t('wiki.cyclePolishing')}>
              {acc.cycle.map(([dust, materials], i) => (
                <Row key={i} label={<Prose text={text?.cycle?.[i]} prompts={labels.prompt} />}>
                  <Cost dust={dust} materials={materials} names={names} />
                </Row>
              ))}
            </Section>
          ) : null}
        </div>
      ) : null}
    </ContentPage>
  )
}

export function MedicineListPage() {
  const { t } = useTranslation()
  const { data, labels, error } = useWiki('medicines')
  const [query, setQuery] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const rows = useMemo(() => (data?.rows ?? []).filter((m) =>
    (!types.length || types.includes(m.type)) && matches(query, data?.text[m.id]?.name),
  ), [data, types, query])

  return (
    <ContentPage active="/medicines" title={labels?.section.medicines ?? t('nav.medicines')} heading wide>
      <PageState error={error} loading={!data || !labels} />
      {data && labels ? (
        <>
          <ListControls
            query={query}
            onQuery={setQuery}
            count={rows.length}
            groups={[{ label: t('wiki.type'), options: optionsOf(data.rows.map((m) => m.type), labels.medicineType), selected: types, onChange: setTypes }]}
          />
          <TileGrid>
            {rows.map((m) => (
              <Tile key={m.id} to="/medicines/$id" params={{ id: m.id }} icon={m.icon} name={data.text[m.id]?.name ?? m.id} sub={labels.medicineType[m.type]} />
            ))}
          </TileGrid>
        </>
      ) : null}
    </ContentPage>
  )
}

export function MedicineDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams({ strict: false }) as { id: string }
  const { data, labels, error } = useWiki('medicines')
  const names = useItemNames()
  const med = data?.byId.get(id)
  const text = med ? data?.text[med.id] : undefined
  const name = text?.name ?? id

  return (
    <ContentPage active="/medicines" title={name}>
      <PageState error={error} loading={!data || !labels} missing={!!data && !med} />
      {med && labels ? (
        <div className="flex flex-col gap-4">
          <DetailHeader image={med.icon} name={name} tags={<Tag>{labels.medicineType[med.type]}</Tag>}>
            <span className="text-sm text-muted-foreground">{t('wiki.uses', { count: med.uses })}</span>
          </DetailHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Section title={t('wiki.effect')}><Prose text={text?.effect} prompts={labels.prompt} /></Section>
            <Section title={t('wiki.lore')}><Prose text={text?.desc} muted /></Section>
          </div>
          {med.levels.length ? (
            <Section title={t('wiki.upgradesShort')}>
              <div className="flex flex-col gap-3">
                {med.levels.map(([dust, materials, uses], i) => (
                  <div key={i} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold">+{i + 1}</span>
                      <span className="text-muted-foreground">{t('wiki.uses', { count: uses })}</span>
                    </div>
                    <Prose text={text?.levels?.[i]} prompts={labels.prompt} />
                    <Row label={t('wiki.cost')}><Cost dust={dust} materials={materials} names={names} /></Row>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      ) : null}
    </ContentPage>
  )
}
