// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { SectionSidebar } from './components/SectionNav'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
afterEach(() => { act(() => root?.unmount()); document.body.replaceChildren() })

it('keeps accessible navigation and submenu host mounted when collapsed', () => {
  const host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  const toggle = vi.fn()
  const slot = vi.fn()
  const render = (collapsed: boolean) => act(() => root!.render(<SectionSidebar entries={[{ key: 'builds', label: 'Build manual', art: 'build.webp' }]} active="builds" onNavigate={vi.fn()} label="Tools" onSubSlot={slot} collapsed={collapsed} onToggle={toggle} />))
  render(false)
  const link = host.querySelector('a')!
  const originalSlot = slot.mock.calls.find(([node]) => node)?.[0]
  expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
  render(true)
  expect(host.querySelector('a')).toBe(link)
  expect(link.getAttribute('aria-label')).toBe('Build manual')
  expect(link.title).toBe('Build manual')
  expect(link.getAttribute('aria-current')).toBe('page')
  expect(originalSlot?.isConnected).toBe(true)
  expect(host.querySelector('button')?.getAttribute('aria-expanded')).toBe('false')
  act(() => host.querySelector('button')!.click())
  expect(toggle).toHaveBeenCalledOnce()
  render(false)
  expect(originalSlot?.isConnected).toBe(true)
  expect(link.title).toBe('')
})
