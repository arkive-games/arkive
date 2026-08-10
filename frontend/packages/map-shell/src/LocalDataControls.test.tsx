// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryClient, type StorageLike } from '@gamemap/state-memory'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalDataControls, localDataStringsFor } from './LocalDataControls'

const strings = localDataStringsFor('en-US')

/**
 * Storage is injected rather than global, for two reasons. `check:shell` forbids
 * naming the browser Web Storage globals anywhere under this package -- comments
 * and tests included -- because map-shell owns no storage; and the jsdom docblock
 * above would not have supplied one anyway on Node 26, where Node's own Web
 * Storage global is undefined without --localstorage-file and shadows jsdom's.
 */
class FakeStorage implements StorageLike {
  readonly values = new Map<string, string>()
  get length() { return this.values.size }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

let device: FakeStorage
let session: FakeStorage
let memory: MemoryClient

function seed(key: string, stateClass: string) {
  device.setItem(key, JSON.stringify({
    schemaVersion: '1.0.0', stateClass, writtenAt: 1_000, value: true,
  }))
}

beforeEach(() => {
  device = new FakeStorage()
  session = new FakeStorage()
  memory = new MemoryClient({ deviceStorage: device, sessionStorage: session })
})
afterEach(cleanup)

describe('LocalDataControls', () => {
  it('clears only the state class named by each scoped action', () => {
    seed('arkive.memory.test.portal.recent', 'recent_activity')
    seed('arkive.memory.test.editor.draft', 'task_draft')

    render(<LocalDataControls strings={strings} memory={memory} />)
    fireEvent.click(screen.getByRole('button', { name: strings.clearRecent }))

    expect(device.getItem('arkive.memory.test.portal.recent')).toBeNull()
    expect(device.getItem('arkive.memory.test.editor.draft')).not.toBeNull()
    expect(screen.getByRole('status').textContent).toContain(strings.cleared)
  })

  it('leaves durable progress alone when clearing a disposable class', () => {
    seed('arkive.memory.test.progress.completed', 'durable_progress')
    seed('arkive.memory.test.portal.recent', 'recent_activity')

    render(<LocalDataControls strings={strings} memory={memory} />)
    fireEvent.click(screen.getByRole('button', { name: strings.clearRecent }))

    expect(device.getItem('arkive.memory.test.progress.completed')).not.toBeNull()
    expect(device.getItem('arkive.memory.test.portal.recent')).toBeNull()
  })

  it('requires confirmation before clearing all Arkive memory', () => {
    seed('arkive.memory.test.progress.completed', 'durable_progress')
    render(<LocalDataControls strings={strings} memory={memory} />)

    fireEvent.click(screen.getByRole('button', { name: strings.clearAll }))
    expect(device.getItem('arkive.memory.test.progress.completed')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: strings.confirm }))

    expect(device.getItem('arkive.memory.test.progress.completed')).toBeNull()
  })
})
