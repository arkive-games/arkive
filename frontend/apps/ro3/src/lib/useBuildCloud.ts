import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@gamemap/auth'
import content from '../locales/zh-CN.json'
import { emptyPlanner, type PlannerBuild } from './plannerModel'
import { BuildFailure, buildPayload, editableBuild, pendingBuildGateway, type BuildGateway, type BuildQuery, type CloudBuild } from './buildGateway'

const c = content.builds.cloud
export function useBuildCloud(query: BuildQuery, gateway: BuildGateway = pendingBuildGateway) {
  const auth = useAuth()
  const [draft, setDraft] = useState<PlannerBuild>(() => emptyPlanner())
  const [saved, setSaved] = useState<CloudBuild | null>(null)
  const [dirty, setDirty] = useState(false)
  const [items, setItems] = useState<CloudBuild[]>([])
  const [total, setTotal] = useState(0)
  const [detail, setDetail] = useState<CloudBuild | null>(null)
  const [error, setError] = useState('')
  const [listError, setListError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const generation = useRef(0)
  const epoch = useRef(0)
  const lock = useRef(false)
  const account = auth.user?.id ?? null
  const [previousAccount, setPreviousAccount] = useState(account)
  const liveAccount = useRef(account)
  useEffect(() => { liveAccount.current = account; epoch.current++ }, [account])
  const { collection, search, root, branch, page, pageSize } = query

  if (previousAccount !== account) {
    setPreviousAccount(account)
    setItems([]); setDetail(null); setSaved(null); setError(''); setLoginOpen(false)
    if (previousAccount !== null) { setDraft(emptyPlanner()); setDirty(false) }
  }

  useEffect(() => {
    let active = true
    void Promise.resolve().then(async () => {
      if (!active) return null
      setItems([]); setTotal(0); setListError('')
      if (!gateway.available) { setListError(c.unavailable); return null }
      if (collection !== 'public' && !account) return null
      setLoading(true)
      return gateway.list({ collection, search, root, branch, page, pageSize })
    }).then(result => {
      if (active && result) { setItems(result.items); setTotal(result.total) }
    }).catch(() => { if (active) setListError(c.failed) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [gateway, collection, search, root, branch, page, pageSize, account, refresh])

  const failure = (value: unknown) => {
    const code = value instanceof BuildFailure ? value.code : 'failed'
    setError(c[code])
    if (code === 'unauthorized' && auth.enabled) setLoginOpen(true)
  }
  const ready = () => {
    setError('')
    if (!auth.enabled) { setError(c.unavailable); return false }
    if (auth.status !== 'authenticated') { setLoginOpen(true); return false }
    if (!gateway.available) { setError(c.unavailable); return false }
    return true
  }
  const patch = (next: Partial<PlannerBuild>) => { generation.current++; setDraft(current => ({ ...current, ...next })); setDirty(true); setError('') }
  const edit = (base?: CloudBuild, copy = false) => {
    if (lock.current || dirty && !window.confirm(content.builds.manual.confirmLeave)) return false
    epoch.current++; generation.current++
    const fresh = emptyPlanner()
    setDraft(base ? { ...editableBuild(base), id: copy ? fresh.id : base.id } : fresh)
    setSaved(base && !copy ? base : null); setDirty(copy); setError('')
    return true
  }
  const run = async (action: () => Promise<void>) => {
    if (lock.current || !ready()) return
    lock.current = true; setBusy(true)
    const owner = account
    const token = epoch.current
    try { await action() } catch (error) { if (liveAccount.current === owner && token === epoch.current) failure(error) }
    finally { lock.current = false; setBusy(false) }
  }
  const save = (publish = false) => run(async () => {
    if (!draft.title.trim() || !draft.jobId || !draft.branchId) { setError(c.required); return }
    if (publish && !window.confirm(c.publishConfirm)) return
    const token = epoch.current
    const owner = account
    const version = generation.current
    const snapshot = buildPayload(draft)
    const result = await gateway.save({ id: saved?.id, revision: saved?.revision, requestId: draft.id, data: snapshot })
    if (owner !== liveAccount.current || token !== epoch.current) return
    setSaved(result)
    if (version === generation.current) { setDraft(editableBuild(result)); setDirty(false) }
    setRefresh(v => v + 1)
    if (publish) {
      const published = await gateway.publish(result.id, result.revision)
      if (owner !== liveAccount.current || token !== epoch.current) return
      setSaved(published); setRefresh(v => v + 1)
    }
  })
  const mutate = (target: CloudBuild, action: 'favorite' | 'unpublish' | 'remove') => run(async () => {
    if (action !== 'favorite' && !window.confirm(action === 'remove' ? c.deleteConfirm : c.unpublishConfirm)) return
    const token = epoch.current
    const owner = account
    let next = target
    if (action === 'favorite') { await gateway.favorite(target.id, !target.favorited); next = { ...target, favorited: !target.favorited } }
    if (action === 'unpublish') next = await gateway.unpublish(target.id, target.revision)
    if (action === 'remove') await gateway.remove(target.id, target.revision)
    if (owner !== liveAccount.current || token !== epoch.current) return
    setDetail(current => current?.id === target.id ? action === 'remove' ? null : next : current); setRefresh(v => v + 1)
  })
  const openPublic = async (id: string) => {
    const token = ++epoch.current
    setError(''); setDetail(null)
    if (!gateway.available) { setError(c.unavailable); return }
    try { const next = await gateway.getPublic(id); if (token === epoch.current) setDetail(next) }
    catch (error) { if (token === epoch.current) failure(error) }
  }
  return { auth, draft, saved, dirty, patch, edit, save, items, total, detail, setDetail, openPublic, mutate,
    error, setError, listError, loading, busy, loginOpen, setLoginOpen, retry: () => setRefresh(v => v + 1) }
}
