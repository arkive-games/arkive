import type { CSSProperties } from 'react'
import { BarChart3, ChevronLeft, Flame, Heart, PawPrint, PenLine, Shield, Star, Zap } from 'lucide-react'
import { cn } from '@gamemap/ui'
import content from '../locales/zh-CN.json'
import { localizedText } from '../cardCatalog'
import { BUILD_SLOTS } from '../lib/buildRules'
import { cardEffect, equipmentLines, jobEmblem, rootTint, ruleSet, soulSubOptions, socketCount, talentInfo, type ManualData } from '../lib/buildView'
import type { PlannerBuild } from '../lib/plannerModel'
import { qualityColor } from '../lib/quality'
import { resourceUrl } from '../lib/urls'
import { Block, ItemIcon, Stats, TileBlock } from './BuildBlocks'

const m = content.builds.manual
const t = content.builds.editor

export function BuildChips({ build, data }: { build: PlannerBuild; data: ManualData | null }) {
  const rules = ruleSet(data, build.rulesVariant)
  const job = rules?.jobs.find(j => j.id === build.jobId)
  const branch = rules?.branches.find(b => b.id === build.branchId)
  return <>
    {job ? <span className="bm-job"><img src={jobEmblem(job.id)} alt="" />{job.name}</span> : null}
    {branch ? <span className="bm-branch">{branch.name}</span> : null}
  </>
}

/** A build, read-only: what it is, then every block in full. */
export function BuildDetail({ build, data, faved, section, onBack, onFav, onTemplate, onEdit }: {
  build: PlannerBuild
  data: ManualData | null
  faved: boolean
  section: string
  onBack: () => void
  onFav: () => void
  onTemplate: () => void
  onEdit?: () => void
}) {
  const rules = ruleSet(data, build.rulesVariant)
  const skillMap = new Map(data?.profession?.skills.skills.map(s => [s.iSkillID, s]) ?? [])
  const petMap = new Map(data?.pets?.catalog.pets.map(p => [p.id, p]) ?? [])
  const equipment = data?.equipment?.equipment.equipment ?? []
  const souls = data?.souls?.souls.souls ?? []
  const cards = data?.cards?.cards ?? []
  const pets = [...Array.from({ length: 4 }, (_, i) => build.combat[i] ?? 0), ...Array.from({ length: 5 }, (_, i) => build.assist[i] ?? 0)]
  const total = build.attributes.reduce((sum, v) => sum + v, 0)

  return <div style={{ '--tint': rootTint(build.jobId) } as CSSProperties}>
    <nav className="bm-crumb">
      <button type="button" className="bm-back" aria-label={m.back} onClick={onBack}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" onClick={onBack}>{section}</button><span>/</span><b>{build.title || t.unnamed}</b>
    </nav>
    <header className="bm-head">
      <div className="bm-head-art"><img src={jobEmblem(build.jobId)} alt="" /></div>
      <div className="bm-hbody">
        <div className="bm-hmain">
          <div className="bm-chips"><BuildChips build={build} data={data} /></div>
          <h1>{build.title || t.unnamed}</h1>
          {build.summary ? <p className="bm-intro">{build.summary}</p> : null}
        </div>
        <div className="bm-acts">
          <button type="button" className={cn('bm-pill', faved && 'on')} aria-pressed={faved} onClick={onFav}><Heart aria-hidden="true" />{faved ? m.faved : m.addFav}</button>
          {onEdit ? <button type="button" className="bm-pill" onClick={onEdit}><PenLine aria-hidden="true" />{m.edit}</button> : null}
          <button type="button" className="bm-pill warm" onClick={onTemplate}>{m.template}</button>
        </div>
      </div>
    </header>

    <div className="bm-blocks ro">
      <Block area="stats" icon={<BarChart3 />} title={t.attributes} count={m.total.replace('{n}', String(total))}>
        <Stats values={build.attributes} />
      </Block>
      <Block area="talents" icon={<Star />} title={t.talents} count={m.items.replace('{n}', String(build.talents.length))}>
        {build.talents.length
          ? <TileBlock readOnly className="bm-tal" tiles={build.talents.map(id => { const info = talentInfo(data, rules, build.jobId, id); return { key: String(id), label: info.label || t.unknown, icon: info.icon } })} />
          : <p className="bm-note">{m.unset}</p>}
      </Block>
      <Block area="skills" icon={<Zap />} title={t.skills} count={m.items.replace('{n}', String(build.skills.filter(Boolean).length))}>
        <TileBlock readOnly tiles={Array.from({ length: 6 }, (_, i) => {
          const skill = skillMap.get(build.skills[i] ?? 0)
          return { key: String(i), label: skill?.name?.['zh-CN'] || (build.skills[i] ? t.unknown : m.emptySlot), icon: skill?.icon, empty: !skill }
        })} />
      </Block>
      <Block area="gear" icon={<Shield />} title={m.gear} count={m.gearCount}>
        <div className="bm-items gear">{BUILD_SLOTS.map(slot => {
          const config = build.equipment.find(e => e.slot === slot.key)
          const record = equipment.find(e => e.iID === config?.id)
          const ids = build.cardSlots[slot.key] ?? []
          const sockets = Math.max(socketCount(data, slot.key), ids.length)
          return <div key={slot.key} className={cn('bm-item', !record && 'none')} style={{ '--q': qualityColor(record?.item?.iQuality) } as CSSProperties}>
            <ItemIcon icon={record?.icon} quality={record?.item?.iQuality} />
            <div className="bm-itx">
              <em>{t.slots[slot.label]}{record?.iRank ? ` · T${record.iRank}` : ''}</em>
              <b>{record?.name?.['zh-CN'] ?? m.unset}</b>
              {record ? <div className="bm-attrs">{equipmentLines(data, record, config?.normal ?? [], config?.special ?? []).map((line, i) => <span key={i} className={line.special ? 's' : undefined}>{line.text}</span>)}</div> : null}
            </div>
            {sockets ? <div className="bm-crds">{Array.from({ length: sockets }, (_, i) => {
              const card = cards.find(c => c.id === ids[i])
              return card
                ? <div key={i} className="bm-crd" style={{ '--q': qualityColor(card.quality) } as CSSProperties}><img src={resourceUrl(card.icon)} alt="" loading="lazy" /><div><b>{localizedText(card.name) || t.unknown}</b><small>{cardEffect(data, card)}</small></div></div>
                : <div key={i} className="bm-crd void">{m.emptySocket}</div>
            })}</div> : null}
          </div>
        })}</div>
      </Block>
      <Block area="souls" icon={<Flame />} title={t.souls} count={m.soulCount}>
        <div className="bm-items souls">{Array.from({ length: 5 }, (_, i) => {
          const config = build.souls[i]
          const soul = souls.find(s => s.iID === config?.id)
          const subs = soul ? soulSubOptions(data, soul).filter(o => config?.sub.includes(o.id)) : []
          return <div key={i} className={cn('bm-item', !soul && 'none')} style={{ '--q': qualityColor(soul?.quality) } as CSSProperties}>
            <ItemIcon icon={soul?.icon} quality={soul?.quality} />
            <div className="bm-itx">
              <b>{soul?.name?.['zh-CN'] ?? m.emptySlot}</b>
              {subs.length ? <div className="bm-attrs">{subs.map(o => <span key={o.id}>{o.label}</span>)}</div> : null}
            </div>
          </div>
        })}</div>
      </Block>
      <Block area="pets" icon={<PawPrint />} title={t.pets} count={m.petCount}>
        <TileBlock readOnly tiles={pets.map((id, i) => {
          const pet = petMap.get(id)
          return { key: String(i), label: pet ? localizedText(pet.name) || t.unknown : m.emptySlot, icon: pet?.art.head, quality: pet?.quality, empty: !pet }
        })} groups={[{ label: t.combat, from: 0, to: 4 }, { label: t.assist, from: 4, to: 9 }]} />
      </Block>
    </div>
  </div>
}
