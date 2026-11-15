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
