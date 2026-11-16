// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CatalogFacetMenu, CatalogFacetOption, CatalogFacetTrack, useCatalogFacetMenus } from './catalog-facets'

afterEach(cleanup)

function Catalog() {
  const menu = useCatalogFacetMenus()
  const [selected, setSelected] = useState(false)
  return <>
    <input aria-label="Search records" defaultValue="ore" />
    <CatalogFacetTrack>
      <CatalogFacetMenu {...menu('elements')} label="Elements" count={Number(selected)} testId="elements">
        <CatalogFacetOption active={selected} label="Fire" onClick={() => setSelected(value => !value)} />
      </CatalogFacetMenu>
      <CatalogFacetMenu {...menu('types')} label="Types" count={0} testId="types">
        <CatalogFacetOption active={false} label="Ranged" onClick={() => {}} />
      </CatalogFacetMenu>
    </CatalogFacetTrack>
  </>
}

it('keeps selection and search when switching panels, and restores focus without reopening after Escape', async () => {
  render(<Catalog />)
  fireEvent.click(screen.getByRole('button', { name: 'Elements' }))
  const fire = await screen.findByRole('button', { name: 'Fire' })
  fireEvent.click(fire)
  expect(fire.getAttribute('aria-pressed')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: 'Types' }))
  await screen.findByRole('button', { name: 'Ranged' })
  expect(screen.queryByRole('button', { name: 'Fire' })).toBeNull()
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Ranged' })).toBeNull())
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Types' }))
  fireEvent.click(screen.getByRole('button', { name: 'Elements' }))
  expect((await screen.findByRole('button', { name: 'Fire' })).getAttribute('aria-pressed')).toBe('true')
  expect((screen.getByRole('textbox', { name: 'Search records' }) as HTMLInputElement).value).toBe('ore')
})
