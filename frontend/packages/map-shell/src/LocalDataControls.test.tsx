// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalDataControls, localDataStringsFor } from './LocalDataControls'

const strings = localDataStringsFor('en-US')

function seed(key: string, stateClass: string) {
  localStorage.setItem(key, JSON.stringify({
    schemaVersion: '1.0.0', stateClass, writtenAt: Date.now(), value: true,
  }))
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('LocalDataControls', () => {
  it('clears only the state class named by each scoped action', () => {
    seed('arkive.memory.test.portal.recent', 'recent_activity')
    seed('arkive.memory.test.editor.draft', 'task_draft')

    render(<LocalDataControls strings={strings} />)
    fireEvent.click(screen.getByRole('button', { name: strings.clearRecent }))

    expect(localStorage.getItem('arkive.memory.test.portal.recent')).toBeNull()
    expect(localStorage.getItem('arkive.memory.test.editor.draft')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toContain(strings.cleared)
  })

  it('requires confirmation before clearing all Arkive memory', () => {
    seed('arkive.memory.test.progress.completed', 'durable_progress')
    render(<LocalDataControls strings={strings} />)

    fireEvent.click(screen.getByRole('button', { name: strings.clearAll }))
    expect(localStorage.getItem('arkive.memory.test.progress.completed')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: strings.confirm }))

    expect(localStorage.getItem('arkive.memory.test.progress.completed')).toBeNull()
  })
})
