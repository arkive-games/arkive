// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArkiveEncyclopediaWorkspace } from './ArkiveEncyclopediaWorkspace'

afterEach(cleanup)
function Workspace({ collapsible = false, appearance = 'framed' }: { collapsible?: boolean; appearance?: 'framed' | 'quiet' }) {
  const [collapsed, setCollapsed] = useState(false)
  return <ArkiveEncyclopediaWorkspace
    groups={[{ key: 'records', label: 'Records', collapsible, entries: [{ key: '/items', label: 'Items', icon: <span aria-hidden>I</span> }] }]}
    active="/items" label="Encyclopedia" collapsed={collapsed} onCollapsedChange={setCollapsed} appearance={appearance}
    collapseLabel="Collapse navigation" expandLabel="Expand navigation"
    railFooter={<a href="/items/ore">Recently viewed ore</a>}
    renderSubnavigation={() => <input aria-label="Subsection choice" defaultValue="season" />}
    renderLink={(entry, className, children) => <a href={entry.key} className={className} aria-current="page" title={entry.label}>{children}</a>}>
    <input aria-label="Search" defaultValue="" />
  </ArkiveEncyclopediaWorkspace>
}
describe('encyclopedia workspace', () => {
  it('retains child navigation under each parent when the quiet directory is collapsed', () => {
    render(<Workspace collapsible appearance="quiet" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'ore' } })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.getByRole('link', { name: 'Items' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(screen.getByRole('button', { name: 'Records' }))
    expect(screen.queryByRole('link', { name: 'Items' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Records' }))
    expect(screen.getByRole('link', { name: 'Items' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('ore')
  })
  it('folds a parent group without changing the selected category or reading controls', () => {
    render(<Workspace collapsible />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'ore' } })
    fireEvent.click(screen.getByRole('button', { name: 'Records' }))
    expect(screen.getByRole('button', { name: 'Records' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link', { name: 'Items' })).toBeNull()
    expect((screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('ore')
    fireEvent.click(screen.getByRole('button', { name: 'Records' }))
    expect(screen.getByRole('link', { name: 'Items' }).getAttribute('aria-current')).toBe('page')
  })
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
    expect(screen.getByRole('link', { name: 'Recently viewed ore' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'ore' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Subsection choice' }), { target: { value: 'patron' } })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse navigation' }))
    expect(screen.queryByRole('link', { name: 'Recently viewed ore' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'Subsection choice' })).toBeNull()
    expect((screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('ore')
    expect(screen.getByRole('link', { name: 'Items' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: 'Expand navigation' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: 'Expand navigation' }))
    expect(screen.getByRole('link', { name: 'Recently viewed ore' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Subsection choice' }) as HTMLInputElement).value).toBe('patron')
    expect((screen.getByRole('textbox', { name: 'Search' }) as HTMLInputElement).value).toBe('ore')
  })
})
