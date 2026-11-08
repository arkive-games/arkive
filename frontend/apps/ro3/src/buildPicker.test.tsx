// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { InlinePicker, Picker, Stats, TileBlock } from './components/BuildBlocks'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
function mount(element: React.ReactNode) {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() => root!.render(element))
  return host
}
function click(button: Element | null) { act(() => (button as HTMLElement).click()) }
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren() })

it('shows stats without progress bars while retaining all six inputs', () => {
  const host = mount(<Stats values={[1, 2, 3, 4, 5, 6]} onChange={vi.fn()} />)
  expect(host.querySelectorAll('.bm-bar')).toHaveLength(0)
  expect(host.querySelectorAll('input')).toHaveLength(6)
})
it('keeps later candidates reachable in an inline paginated grid', () => {
  const pick = vi.fn()
  const host = mount(<Picker what="Cards" items={Array.from({ length: 25 }, (_, id) => ({ id, label: `Card ${id}`, icon: 'card.webp' }))} onPick={pick} />)
  expect(host.querySelectorAll('.bm-candidate')).toHaveLength(24)
  expect(host.querySelector('[role=dialog]')).toBeNull()
  click(host.querySelector('.bm-pagination button:last-child'))
  expect(host.querySelectorAll('.bm-candidate')).toHaveLength(1)
  click(host.querySelector('.bm-candidate'))
  expect(pick).toHaveBeenCalledWith(24)
})
it('opens affix choices inline and closes them after selecting', () => {
  const pick = vi.fn()
  const host = mount(<InlinePicker what="Affixes" items={[{ id: 1, label: 'Strength' }]} onPick={pick} />)
  click(host.querySelector('button'))
  expect(host.querySelector('.bm-cands')).not.toBeNull()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  click(host.querySelector('.bm-candidate'))
  expect(pick).toHaveBeenCalledWith(1)
  expect(host.querySelector('.bm-cands')).toBeNull()
})
it('opens populated slots directly and keeps removal outside the selection button', () => {
  const remove = vi.fn()
  const host = mount(<TileBlock tiles={[{ key: 'one', label: 'Existing', onRemove: remove }]} renderInfo={() => <Picker what="Cards" items={[{ id: 2, label: 'Replacement' }]} onPick={vi.fn()} />} />)
  click(host.querySelector('[data-tile]'))
  expect(host.querySelector('.bm-candidate')).not.toBeNull()
  expect(host.querySelector('button button')).toBeNull()
  click(host.querySelector('.bm-icon-remove'))
  expect(remove).toHaveBeenCalledOnce()
})
