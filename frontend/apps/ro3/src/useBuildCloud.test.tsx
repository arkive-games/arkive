// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

let mounted: Root | undefined
function renderHook<T>(useValue: () => T) {
  const result = { current: undefined as T }
  const host = document.createElement('div')
  document.body.append(host)
  mounted = createRoot(host)
  function Harness() { result.current = useValue(); return null }
  const rerender = () => act(() => mounted!.render(<Harness />))
  rerender()
  return { result, rerender }
}
function cleanup() { act(() => mounted?.unmount()); mounted = undefined; document.body.replaceChildren() }
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
import { afterEach, expect, it, vi } from 'vitest'
import { useBuildCloud } from './lib/useBuildCloud'
import { buildPayload, pendingBuildGateway, type BuildGateway, type CloudBuild } from './lib/buildGateway'
import { emptyPlanner } from './lib/plannerModel'

const session = vi.hoisted(() => ({ enabled: true, status: 'authenticated', user: { id: 'one' } as { id: string } | null }))
vi.mock('@gamemap/auth', () => ({ useAuth: () => session }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); session.status = 'authenticated'; session.user = { id: 'one' } })
const query = { collection: 'mine' as const, search: '', root: 0, branch: 0, page: 1, pageSize: 20 }
function record(): CloudBuild {
  return { id: 'server', revision: 1, publishedRevision: null, editable: true, favorited: false, data: buildPayload({ ...emptyPlanner(), title: 'Saved', jobId: 1400, branchId: 131 }) }
}
function api(): BuildGateway {
  return { ...pendingBuildGateway, available: true, list: vi.fn(async () => ({ items: [], total: 0 })), save: vi.fn(async () => record()), publish: vi.fn(async () => ({ ...record(), publishedRevision: 1 })) }
}
it('retains edits made while a save is pending and does not publish on save', async () => {
  const gateway = api()
  let resolve!: (value: CloudBuild) => void
  gateway.save = vi.fn(() => new Promise<CloudBuild>(done => { resolve = done }))
  const { result } = renderHook(() => useBuildCloud(query, gateway))
  act(() => result.current.patch({ title: 'First', jobId: 1400, branchId: 131 }))
  let pending!: Promise<void>
  act(() => { pending = result.current.save() })
  act(() => result.current.patch({ title: 'Newer edit' }))
  await act(async () => { resolve(record()); await pending })
  expect(result.current.draft.title).toBe('Newer edit')
  expect(result.current.dirty).toBe(true)
  expect(result.current.saved?.revision).toBe(1)
  expect(gateway.publish).not.toHaveBeenCalled()
})
it('publishes the acknowledged revision only after confirmation', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const gateway = api()
  const { result } = renderHook(() => useBuildCloud(query, gateway))
  act(() => result.current.patch({ title: 'First', jobId: 1400, branchId: 131 }))
  await act(async () => { await result.current.save(true) })
  expect(gateway.publish).toHaveBeenCalledWith('server', 1)
  expect(result.current.saved?.publishedRevision).toBe(1)
})
it('does not replace private state with an old account save response', async () => {
  const gateway = api()
  let resolve!: (value: CloudBuild) => void
  gateway.save = vi.fn(() => new Promise<CloudBuild>(done => { resolve = done }))
  const { result, rerender } = renderHook(() => useBuildCloud(query, gateway))
  act(() => result.current.patch({ title: 'Private', jobId: 1400, branchId: 131 }))
  let pending!: Promise<void>
  act(() => { pending = result.current.save() })
  session.user = { id: 'two' }
  rerender()
  await act(async () => { resolve(record()); await pending })
  expect(result.current.saved).toBeNull()
  expect(result.current.draft.title).toBe('')
})
it('ignores a delayed share response after returning to the list or selecting another build', async () => {
  const gateway = api()
  let resolve!: (value: CloudBuild) => void
  gateway.getPublic = vi.fn(() => new Promise<CloudBuild>(done => { resolve = done }))
  const { result } = renderHook(() => useBuildCloud(query, gateway))
  let pending!: Promise<void>
  act(() => { pending = result.current.openPublic('old') })
  act(() => result.current.selectDetail(null))
  await act(async () => { resolve({ ...record(), id: 'old' }); await pending })
  expect(result.current.detail).toBeNull()
  act(() => { pending = result.current.openPublic('old') })
  act(() => result.current.selectDetail({ ...record(), id: 'new' }))
  await act(async () => { resolve({ ...record(), id: 'old' }); await pending })
  expect(result.current.detail?.id).toBe('new')
})
it('keeps an anonymous draft through login without automatically publishing', async () => {
  session.user = null; session.status = 'anonymous'
  const gateway = api()
  const { result, rerender } = renderHook(() => useBuildCloud(query, gateway))
  act(() => result.current.patch({ title: 'Unsaved' }))
  await act(async () => { await result.current.save(true) })
  expect(result.current.loginOpen).toBe(true)
  session.user = { id: 'one' }; session.status = 'authenticated'
  rerender()
  await act(async () => { await Promise.resolve() })
  expect(result.current.loginOpen).toBe(false)
  expect(result.current.draft.title).toBe('Unsaved')
  expect(gateway.publish).not.toHaveBeenCalled()
})
