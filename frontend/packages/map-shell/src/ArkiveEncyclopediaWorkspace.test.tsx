// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArkiveEncyclopediaWorkspace } from './ArkiveEncyclopediaWorkspace'

afterEach(cleanup)
function Workspace() {
  const [collapsed, setCollapsed] = useState(false)
  return <ArkiveEncyclopediaWorkspace
    groups={[{ key: 'records', label: 'Records', entries: [{ key: '/items', label: 'Items', icon: <span aria-hidden>I</span> }] }]}
    active="/items" label="Encyclopedia" collapsed={collapsed} onCollapsedChange={setCollapsed}
    collapseLabel="Collapse navigation" expandLabel="Expand navigation"
    renderLink={(entry, className, children) => <a href={entry.key} className={className} aria-current="page" title={entry.label}>{children}</a>}>
    <input aria-label="Search" defaultValue="" />
  </ArkiveEncyclopediaWorkspace>
}
describe('encyclopedia workspace', () => {
  it('shows the current branch children and retains its parent highlight when collapsed', () => {
    const renderWorkspace = (collapsed: boolean) => <ArkiveEncyclopediaWorkspace
      groups={[{ key: 'wiki', label: 'Wiki', entries: [{ key: '/fellows', label: 'Connections', icon: <span aria-hidden>C</span>, children: [{ key: '/fellows/relations', label: 'Relations', icon: <span aria-hidden>R</span> }] }] }]}
      active="/fellows/relations" label="Encyclopedia" collapsed={collapsed} onCollapsedChange={() => {}}
      collapseLabel="Collapse" expandLabel="Expand"
      renderLink={(entry, className, children) => <a href={entry.key} className={className}>{children}</a>}>
      <p>Records</p>
    </ArkiveEncyclopediaWorkspace>
    const { rerender } = render(renderWorkspace(false))
    expect(screen.getByRole('link', { name: 'Relations' })).toBeTruthy()
    rerender(renderWorkspace(true))
    expect(screen.queryByRole('link', { name: 'Relations' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Connections' }).className).toContain('ring-border')
    expect(screen.getByText('Records')).toBeTruthy()
  })
  it('retains reading controls and accessible category links when the rail folds', () => {
    render(<Workspace />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'ore' } })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('ore')
    expect(screen.getByRole('link', { name: 'Items' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Expand navigation' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }))
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('ore')
  })
})
