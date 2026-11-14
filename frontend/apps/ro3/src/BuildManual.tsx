import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { BookMarked, FolderOpen, Heart, Plus, Search } from 'lucide-react'
import { cn } from '@gamemap/ui'
import content from './locales/zh-CN.json'
import { loadPetWikiData } from './creatureData'
import { loadCardCatalogData, loadEquipmentWikiData, loadProfessionWikiData, loadSoulWikiData, loadTalentWikiData } from './wikiData'
import { BUILD_SLOTS, loadBuildRules } from './lib/buildRules'
import type { PlannerBuild } from './lib/plannerModel'
import { AccountDialog, authStringsFor } from '@gamemap/auth'
import { browserMemory } from '@gamemap/state-memory'
import { favoritesRecord, BUILD_STORAGE_KEY } from './lib/buildState'
import { useBuildCloud } from './lib/useBuildCloud'
import { pendingBuildGateway, editableBuild, publicBuildLink, type BuildGateway, type CloudBuild } from './lib/buildGateway'
import { registerBuildNavigationGuard } from './lib/buildNavigation'
import { jobEmblem, rootBranches, rootEmblem, rootTint, ROOTS, type ManualData } from './lib/buildView'
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

const c = content.builds.cloud

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

export function BuildManual({ gateway = pendingBuildGateway }: { gateway?: BuildGateway }) {
  const [data, setData] = useState<ManualData | null>(null)
  const [section, setSection] = useState<Section>('rec')
  const [view, setView] = useState<View>(() => {
    const id = new URLSearchParams(window.location.search).get('build')
    return id ? { mode: 'detail', id } : { mode: 'list' }
  })
  const [root, setRoot] = useState(0)
  const [branch, setBranch] = useState(0)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)
  const cloud = useBuildCloud({ collection: section === 'rec' ? 'public' : section === 'mine' ? 'mine' : 'favorites', search: query, root, branch, page, pageSize: 20 }, gateway)
  const { draft, dirty, error } = cloud
  const dirtyRef = useRef(false)
  useEffect(() => { dirtyRef.current = dirty }, [dirty])
  useEffect(() => registerBuildNavigationGuard(() => !dirtyRef.current || window.confirm(c.leave)), [])
  useEffect(() => {
    try { window.localStorage.removeItem(BUILD_STORAGE_KEY); window.localStorage.removeItem(`${BUILD_STORAGE_KEY}:before-v2`); browserMemory.clear(favoritesRecord) } catch { /* Storage denial must not block the account surface. */ }
  }, [])
  const linkAccount = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const account = cloud.auth.user?.id ?? null
    if (linkAccount.current === account) return
    linkAccount.current = account
    const id = new URLSearchParams(window.location.search).get('build')
    if (id) void Promise.resolve().then(() => cloud.openPublic(id))
  }, [cloud])
  useEffect(() => {
    const adopt = () => {
      const id = new URLSearchParams(window.location.search).get('build')
      if (id) { setView({ mode: 'detail', id }); void cloud.openPublic(id) }
      else { cloud.selectDetail(null); setView({ mode: 'list' }) }
    }
    window.addEventListener('ro3:location-adopted', adopt)
    return () => window.removeEventListener('ro3:location-adopted', adopt)
  }, [cloud])

  useEffect(() => {
    let active = true
    void Promise.allSettled([loadBuildRules(), loadProfessionWikiData(), loadEquipmentWikiData(), loadCardCatalogData(), loadPetWikiData(), loadTalentWikiData(), loadSoulWikiData()]).then(results => {
      if (!active) return
      const value = <T,>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : undefined
      const next: ManualData = { rules: value(results[0]), profession: value(results[1]), equipment: value(results[2]), cards: value(results[3]), pets: value(results[4]), talents: value(results[5]), souls: value(results[6]) }
      setData(next)
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
  const shown = cloud.items
  const needle = query.trim()
  const branches = useMemo(() => rootBranches(rules, root), [rules, root])
  const clearShareUrl = () => {
    if (window.location.search) window.history.replaceState(window.history.state, '', '/builds')
  }
  const backToList = () => { clearShareUrl(); cloud.selectDetail(null); setView({ mode: 'list' }) }
  const go = (next: Section) => { setSection(next); setPage(1); backToList() }
  const startEdit = (base?: CloudBuild, keepId = false) => {
    if (!loaded || cloud.busy) return
    if (!base && dirty) { setView({ mode: 'edit' }); return }
    if (cloud.edit(base, !keepId && Boolean(base))) { clearShareUrl(); setView({ mode: 'edit' }) }
  }
  const share = async (id: string) => {
    try { await navigator.clipboard.writeText(publicBuildLink(id)); cloud.setError(c.copied) }
    catch { cloud.setError(c.failed) }
  }
  const sectionLabel = SECTIONS.find(s => s.key === section)!.label
  const emptyText = needle ? m.emptySearch : section === 'mine' ? m.emptyMine : section === 'fav' ? m.emptyFav : m.emptyList

  const nav = <>
    <AccountDialog open={cloud.loginOpen} onOpenChange={cloud.setLoginOpen} strings={authStringsFor('zh-CN')} />
    <SidebarSub>
      <div role="tablist" aria-orientation="vertical" className="ro3-build-subnav my-1 ml-6 flex flex-col gap-0.5 border-l-2 border-border pl-2">
        {SECTIONS.map(({ key, label, icon: Icon }) => {
          const selected = section === key
          return <button key={key} type="button" role="tab" aria-selected={selected} aria-label={label} title={label} onClick={() => go(key)}
            className={cn('flex h-9 items-center gap-2 rounded-lg px-2 text-sm transition-colors', selected ? 'bg-[color:var(--arkive-filter-active)] font-bold text-[color:var(--arkive-nav-active)]' : 'font-semibold text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Icon className="size-4 shrink-0" aria-hidden="true" /><span className="ro3-sidebar-label">{label}</span>
          </button>
        })}
      </div>
    </SidebarSub>
    <HeaderAction>
      <button type="button" className="bm-pill warm sm" disabled={!loaded} onClick={() => startEdit()}><Plus aria-hidden="true" />{m.newBuild}</button>
    </HeaderAction>
  </>

  if (view.mode === 'edit') return <div className="ro3-bm">{nav}
    {!gateway.available ? <p className="bm-note bm-cloud-notice">{c.unavailable}</p> : null}
    <BuildEditor draft={draft} data={data} plans={[]} dirty={dirty} error={error} backLabel={sectionLabel}
      busy={cloud.busy} cloudStatus={!cloud.saved ? c.newDraft : dirty ? m.unsaved : cloud.saved.publishedRevision === null ? c.private : cloud.saved.publishedRevision === cloud.saved.revision ? c.published : c.unpublishedChanges}
      publishLabel={cloud.saved?.publishedRevision ? c.updatePublish : c.publish} onPublish={() => void cloud.save(true)}
      onChange={cloud.patch} onSave={() => void cloud.save()} onOpen={() => {}}
      onBack={backToList} />
  </div>

  const detail = view.mode === 'detail' && cloud.detail?.id === view.id ? cloud.detail : null
  if (view.mode === 'detail') return <div className="ro3-bm">{nav}
    {error ? <p role="status" className="bm-note">{error}</p> : null}
    {detail ? <>
      <div className="bm-cloud-actions">
        <span>{detail.publishedRevision === null ? c.private : c.published}</span>
        {detail.publishedRevision !== null ? <button className="bm-chip" type="button" onClick={() => void share(detail.id)}>{c.share}</button> : null}
        {detail.editable && detail.publishedRevision !== null ? <button className="bm-chip" disabled={cloud.busy} type="button" onClick={() => void cloud.mutate(detail, 'unpublish')}>{c.unpublish}</button> : null}
        {detail.editable ? <button className="bm-chip" disabled={cloud.busy} type="button" onClick={() => void cloud.mutate(detail, 'remove')}>{c.delete}</button> : null}
      </div>
      <BuildDetail build={editableBuild(detail)} data={data} faved={detail.favorited} section={sectionLabel} canFavorite={detail.publishedRevision !== null} busy={cloud.busy}
        onBack={backToList} onFav={() => void cloud.mutate(detail, 'favorite')}
        onTemplate={() => startEdit(detail)} onEdit={detail.editable ? () => startEdit(detail, true) : undefined} />
    </> : <div className="bm-empty"><p>{error || c.notFound}</p><button type="button" className="bm-chip" onClick={backToList}>{m.back}</button></div>}
  </div>

  const tint = root ? rootTint(root) : 'var(--arkive-nav-accent)'
  return <div className="ro3-bm" style={{ '--tint': tint } as CSSProperties}>{nav}
    <div className="mb-3 lg:hidden"><div className="bm-track sm"><div>{SECTIONS.map(s => <button key={s.key} type="button" className={cn(section === s.key && 'on')} onClick={() => go(s.key)}>{s.label}</button>)}</div></div></div>
    <div className="bm-controls">
      <div className="bm-track cls"><div>
        <button type="button" className={cn('all', !root && 'on')} onClick={() => { setRoot(0); setBranch(0); setPage(1) }}>{m.all}</button>
        {ROOTS.filter(r => rules?.jobs.some(j => j.id === r.id)).map(r => <button key={r.id} type="button" className={cn(root === r.id && 'on')} onClick={() => { setRoot(r.id); setBranch(0); setPage(1) }}>
          <img src={rootEmblem(r.id)} alt="" />{rules?.jobs.find(j => j.id === r.id)?.name}
        </button>)}
      </div></div>
      <div className="bm-crow">
        <div className="bm-rtabs" role="tablist">
          {root
            ? <>
              <button type="button" role="tab" aria-selected={!branch} className={cn(!branch && 'on')} onClick={() => { setBranch(0); setPage(1) }}>{m.allBranches}</button>
              {branches.map(({ branch: b }) => <button key={b.id} type="button" role="tab" aria-selected={branch === b.id} className={cn(branch === b.id && 'on')} onClick={() => { setBranch(b.id); setPage(1) }}>
                {b.name}
              </button>)}
            </>
            : <button type="button" role="tab" aria-selected className="on">{m.allJobs}</button>}
        </div>
        <div className="bm-cright">
          <label className="bm-search"><input value={query} onChange={e => { setQuery(e.target.value); setPage(1) }} placeholder={m.searchPlaceholder} aria-label={m.searchPlaceholder} /><span><Search aria-hidden="true" /></span></label>
          <button type="button" className="bm-pill warm hidden lg:inline-flex" disabled={!loaded} onClick={() => startEdit()}><Plus aria-hidden="true" />{m.newBuild}</button>
        </div>
      </div>
    </div>
    {error ? <p className="bm-note" role="status">{error}</p> : null}
    {cloud.loading ? <p className="bm-note" role="status">{c.loading}</p>
      : cloud.listError ? <div className="bm-empty"><p>{cloud.listError}</p>{gateway.available ? <button type="button" className="bm-chip" onClick={cloud.retry}>{c.retry}</button> : null}</div>
      : section !== 'rec' && cloud.auth.status !== 'authenticated' ? <div className="bm-empty"><p>{c.loginRequired}</p><button type="button" className="bm-pill" onClick={() => cloud.auth.enabled ? cloud.setLoginOpen(true) : cloud.setError(c.unavailable)}>{c.login}</button></div>
      : shown.length ? <div className="bm-rows">{shown.map(b => <BuildRow key={b.id} build={editableBuild(b)} data={data} faved={b.favorited} onOpen={() => { window.history.replaceState(window.history.state, '', section === 'mine' ? '/builds' : publicBuildLink(b.id)); cloud.selectDetail(b); setView({ mode: 'detail', id: b.id }) }} />)}</div>
      : <div className="bm-empty"><p>{emptyText}</p>{needle ? null : <button type="button" className="bm-pill warm" disabled={!loaded} onClick={() => startEdit()}><Plus aria-hidden="true" />{m.newBuild}</button>}</div>}
    {cloud.total > 20 || page > 1 ? <nav className="bm-pagination"><button className="bm-chip" type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{m.previousPage}</button><span>{page}/{Math.ceil(cloud.total / 20)}</span><button className="bm-chip" type="button" disabled={page * 20 >= cloud.total} onClick={() => setPage(p => p + 1)}>{m.nextPage}</button></nav> : null}
  </div>
}
