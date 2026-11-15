// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CatalogSearchInput } from './catalog-search-input'

afterEach(cleanup)
it('keeps the live query when submitting and returns focus after clearing', () => {
  const search = vi.fn()
  function Catalog() {
    const [query, setQuery] = useState('')
    return <CatalogSearchInput value={query} onChange={event => setQuery(event.target.value)}
      placeholder="Find records" submitLabel="Search records" clearLabel="Clear search"
      onClear={() => setQuery('')} onSearch={search} />
  }
  render(<Catalog />)
  const input = screen.getByRole('searchbox') as HTMLInputElement
  fireEvent.change(input, { target: { value: 'blood' } })
  fireEvent.submit(screen.getByRole('search'))
  expect(search).toHaveBeenCalledOnce()
  expect(input.value).toBe('blood')
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(input.value).toBe('')
  expect(document.activeElement).toBe(input)
})
