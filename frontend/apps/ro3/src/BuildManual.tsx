import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BookMarked, FolderOpen, Heart, Plus, Search } from 'lucide-react'
import { cn } from '@gamemap/ui'
import content from './locales/zh-CN.json'
import { loadPetWikiData } from './creatureData'
import { loadCardCatalogData, loadEquipmentWikiData, loadProfessionWikiData, loadSoulWikiData, loadTalentWikiData } from './wikiData'
import { BUILD_SLOTS, careerRoot, loadBuildRules } from './lib/buildRules'
import { emptyPlanner, migratePlanner, readPlannerStorage, savePlannerBuilds, type PlannerBuild } from './lib/plannerModel'
import { readFavorites, writeFavorites } from './lib/buildState'
import { buildSearchText, jobEmblem, rootBranches, rootEmblem, rootTint, ROOTS, ruleSet, type ManualData } from './lib/buildView'
import { qualityColor } from './lib/quality'
import { resourceUrl } from './lib/urls'
import { HeaderAction, SidebarSub } from './components/SectionNav'
import { BuildChips, BuildDetail } from './components/BuildDetail'
import { BuildEditor } from './components/BuildEditor'
import './buildManual.css'

const m = content.builds.manual
const t = content.builds.editor

type Section = 'rec' | 'mine' | 'fav'
type View = { mode: 'list' } | { mode: 'detail'; id: string } | { mode: 'edit' }

const SECTIONS: Array<{ key: Section; label: string; icon: typeof Heart }> = [
  { key: 'rec', label: m.rec, icon: BookMarked },
  { key: 'mine', label: m.mine, icon: FolderOpen },
  { key: 'fav', label: m.fav, icon: Heart },
]

/** Recommended builds ship empty until the first curated ones are written. */
const RECOMMENDED: PlannerBuild[] = []

function BuildRow({ build, data, faved, onOpen }: { build: PlannerBuild; data: ManualData | null; faved: boolean; onOpen: () => void }) {
  const skills = new Map(data?.profession?.skills.skills.map(s => [s.iSkillID, s]) ?? [])
  const equipment = new Map(data?.equipment?.equipment.equipment.map(e => [e.iID, e]) ?? [])
  const icons = build.skills.map(id => skills.get(id)?.icon).filter((icon): icon is string => Boolean(icon))
  const gear = BUILD_SLOTS.map(s => equipment.get(build.equipment.find(e => e.slot === s.key)?.id ?? 0)).filter(e => e?.icon)
  return <button type="button" className="bm-row" style={{ '--tint': rootTint(build.jobId) } as CSSProperties} onClick={onOpen}>
    <span className="bm-thumb">{build.jobId ? <img src={jobEmblem(build.jobId)} alt="" /> : null}</span>
    <span className="bm-rmain">
      <h3>{build.title || t.unnamed}</h3>
      {build.summary ? <span className="bm-intro">{build.summary}</span> : null}
      <span className="bm-meta"><BuildChips build={build} data={data} /></span>
    </span>
    {icons.length ? <span className="bm-hotbar">{icons.map((icon, i) => <img key={i} src={resourceUrl(icon)} alt="" loading="lazy" />)}</span> : <span />}
    {gear.length ? <span className="bm-gearrow">{gear.map((e, i) => <img key={i} src={resourceUrl(e!.icon!)} alt="" loading="lazy" style={{ '--q': qualityColor(e!.item?.iQuality) } as CSSProperties} />)}</span> : <span className="bm-gearrow" />}
    <span className={cn('bm-likes', faved && 'on')}><Heart aria-hidden="true" /></span>
  </button>
}

export function BuildManual() {
  const [data, setData] = useState<ManualData | null>(null)
  const [plans, setPlans] = useState<PlannerBuild[]>([])
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites())
  const [section, setSection] = useState<Section>('rec')
  const [view, setView] = useState<View>({ mode: 'list' })
  const [draft, setDraft] = useState<PlannerBuild>(() => emptyPlanner())
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [root, setRoot] = useState(0)
  const [branch, setBranch] = useState(0)
  const [query, setQuery] = useState('')
  // Saved plans arrive with the data; editing waits for them so a save cannot overwrite storage with an empty list.
  const [loaded, setLoaded] = useState(false)
  const malformed = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    void Promise.allSettled([loadBuildRules(), loadProfessionWikiData(), loadEquipmentWikiData(), loadCardCatalogData(), loadPetWikiData(), loadTalentWikiData(), loadSoulWikiData()]).then(results => {
      if (!active) return
      const value = <T,>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : undefined
      const next: ManualData = { rules: value(results[0]), profession: value(results[1]), equipment: value(results[2]), cards: value(results[3]), pets: value(results[4]), talents: value(results[5]), souls: value(results[6]) }
      setData(next)
      const stored = readPlannerStorage(window.localStorage)
      // Unreadable storage is kept and handed to the next save's recovery record rather than dropped.
      if (stored.malformed) malformed.current = stored.raw
      const used = new Set<string>()
      setPlans(stored.records.map((record, index) => {
        const build = migratePlanner(record, next.equipment?.equipment.equipment ?? [], t.attributesList)
        const base = build.id
        let suffix = 0
        while (used.has(build.id)) build.id = `${base}-recovered-${index}-${suffix++}`
        used.add(build.id)
        return build
      }))
      setLoaded(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const rules = data?.rules?.shared
  const pool = section === 'rec' ? RECOMMENDED : section === 'mine' ? plans : [...RECOMMENDED, ...plans].filter(b => favorites.includes(b.id))
  // Newest first; a 'hot' order returns once builds carry likes.
  const ordered = [...pool].reverse()
  const needle = query.trim().toLocaleLowerCase('zh-CN')
  const searched = needle ? ordered.filter(b => buildSearchText(b, ruleSet(data, b.rulesVariant)).includes(needle)) : ordered
  const inRoot = root ? searched.filter(b => careerRoot(b.jobId) === root) : searched
  const shown = branch ? inRoot.filter(b => b.branchId === branch) : inRoot
  const branches = useMemo(() => rootBranches(rules, root), [rules, root])
  const counts: Record<Section, number> = { rec: RECOMMENDED.length, mine: plans.length, fav: [...RECOMMENDED, ...plans].filter(b => favorites.includes(b.id)).length }

  // Leaving the editor keeps an unsaved draft; 'new build' brings it back instead of starting over.
  const go = (next: Section) => { setSection(next); setView({ mode: 'list' }) }
  const startEdit = (base?: PlannerBuild, keepId = false) => {
    if (!loaded) return
    if (!base && dirty) { setView({ mode: 'edit' }); return }
    if (base && dirty && !window.confirm(m.confirmLeave)) return
    const fresh = emptyPlanner()
    setDraft(base ? { ...structuredClone(base), id: keepId ? base.id : fresh.id, recovery: keepId ? base.recovery : [] } : fresh)
    setDirty(false); setError(''); setView({ mode: 'edit' })
  }
  const patch = (next: Partial<PlannerBuild>) => { setDraft(current => ({ ...current, ...next })); setDirty(true); setError('') }
  const save = () => {
    if (!loaded) return
    const build = malformed.current === null ? draft : { ...draft, recovery: [...draft.recovery, { raw: malformed.current }] }
    const next = plans.some(b => b.id === build.id) ? plans.map(b => b.id === build.id ? build : b) : [...plans, build]
    if (!savePlannerBuilds(next, window.localStorage)) { setError(content.builds.saveError); return }
    malformed.current = null
    setPlans(next); setDraft(build); setDirty(false)
  }
  const toggleFav = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter(v => v !== id) : [...favorites, id]
    if (writeFavorites(next)) setFavorites(next)
  }
  const sectionLabel = SECTIONS.find(s => s.key === section)!.label
  const emptyText = needle ? m.emptySearch : section === 'mine' ? m.emptyMine : section === 'fav' ? m.emptyFav : m.emptyList

  const nav = <>
    <SidebarSub>
      <div role="tablist" aria-orientation="vertical" className="my-1 ml-6 flex flex-col gap-0.5 border-l-2 border-border pl-2">
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const selected = section === key
          return <button key={key} type="button" role="tab" aria-selected={selected} onClick={() => go(key)}
            className={cn('flex h-9 items-center gap-2 rounded-lg px-2 text-sm transition-colors', selected ? 'bg-[color:var(--arkive-filter-active)] font-bold text-[color:var(--arkive-nav-active)]' : 'font-semibold text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Icon className="size-4" aria-hidden="true" />{label}<span className="ml-auto text-xs font-semibold text-muted-foreground">{counts[key]}</span>
          </button>
        })}
      </div>
    </SidebarSub>
    <HeaderAction>
      <button type="button" className="bm-pill warm sm" disabled={!loaded} onClick={() => startEdit()}><Plus aria-hidden="true" />{m.newBuild}</button>
    </HeaderAction>
  </>

  if (view.mode === 'edit') return <div className="ro3-bm">{nav}
    <BuildEditor draft={draft} data={data} plans={plans} dirty={dirty} error={error} backLabel={sectionLabel}
      onChange={patch} onSave={save} onOpen={p => startEdit(p, true)}
      onBack={() => setView({ mode: 'list' })} />
  </div>

  const detail = view.mode === 'detail' ? [...RECOMMENDED, ...plans].find(b => b.id === view.id) : undefined
  if (detail) {
    const own = plans.some(p => p.id === detail.id)
    return <div className="ro3-bm">{nav}
      <BuildDetail build={detail} data={data} faved={favorites.includes(detail.id)} section={sectionLabel}
        onBack={() => setView({ mode: 'list' })} onFav={() => toggleFav(detail.id)}
        onTemplate={() => startEdit(detail)} onEdit={own ? () => startEdit(detail, true) : undefined} />
    </div>
  }

  const tint = root ? rootTint(root) : 'var(--arkive-nav-accent)'
  return <div className="ro3-bm" style={{ '--tint': tint } as CSSProperties}>{nav}
    <div className="mb-3 lg:hidden"><div className="bm-track sm"><div>{SECTIONS.map(s => <button key={s.key} type="button" className={cn(section === s.key && 'on')} onClick={() => go(s.key)}>{s.label}</button>)}</div></div></div>
    <div className="bm-controls">
      <div className="bm-track cls"><div>
        <button type="button" className={cn('all', !root && 'on')} onClick={() => { setRoot(0); setBranch(0) }}>{m.all}</button>
        {ROOTS.filter(r => rules?.jobs.some(j => j.id === r.id)).map(r => <button key={r.id} type="button" className={cn(root === r.id && 'on')} onClick={() => { setRoot(r.id); setBranch(0) }}>
          <img src={rootEmblem(r.id)} alt="" />{rules?.jobs.find(j => j.id === r.id)?.name}
        </button>)}
      </div></div>
      <div className="bm-crow">
        <div className="bm-rtabs" role="tablist">
          {root
            ? <>
              <button type="button" role="tab" aria-selected={!branch} className={cn(!branch && 'on')} onClick={() => setBranch(0)}>{m.allBranches}<small>{inRoot.length}</small></button>
              {branches.map(({ branch: b }) => <button key={b.id} type="button" role="tab" aria-selected={branch === b.id} className={cn(branch === b.id && 'on')} onClick={() => setBranch(b.id)}>
                {b.name}<small>{searched.filter(x => careerRoot(x.jobId) === root && x.branchId === b.id).length}</small>
              </button>)}
            </>
            : <button type="button" role="tab" aria-selected className="on">{m.allJobs}<small>{searched.length}</small></button>}
        </div>
        <div className="bm-cright">
          <label className="bm-search"><input value={query} onChange={e => setQuery(e.target.value)} placeholder={m.searchPlaceholder} aria-label={m.searchPlaceholder} /><span><Search aria-hidden="true" /></span></label>
          <button type="button" className="bm-pill warm hidden lg:inline-flex" disabled={!loaded} onClick={() => startEdit()}><Plus aria-hidden="true" />{m.newBuild}</button>
        </div>
      </div>
    </div>
    {shown.length
      ? <div className="bm-rows">{shown.map(b => <BuildRow key={b.id} build={b} data={data} faved={favorites.includes(b.id)} onOpen={() => setView({ mode: 'detail', id: b.id })} />)}</div>
      : <div className="bm-empty"><p>{emptyText}</p>{needle ? null : <button type="button" className="bm-pill warm" disabled={!loaded} onClick={() => startEdit()}><Plus aria-hidden="true" />{m.newBuild}</button>}</div>}
  </div>
}
