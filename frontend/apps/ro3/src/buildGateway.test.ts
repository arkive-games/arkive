import { describe, expect, it } from 'vitest'
import { buildPayload, editableBuild, pendingBuildGateway, publicBuildLink } from './lib/buildGateway'
import { emptyPlanner } from './lib/plannerModel'
import { canLeaveBuild, registerBuildNavigationGuard } from './lib/buildNavigation'

describe('cloud build frontend boundary', () => {
  it('never pretends to save or publish before backend integration', async () => {
    expect(pendingBuildGateway.available).toBe(false)
    await expect(pendingBuildGateway.save({ requestId: 'test', data: buildPayload(emptyPlanner('test')) })).rejects.toMatchObject({ code: 'unavailable' })
    await expect(pendingBuildGateway.publish('test', 1)).rejects.toMatchObject({ code: 'unavailable' })
    await expect(pendingBuildGateway.getPublic('test')).rejects.toMatchObject({ code: 'unavailable' })
  })
  it('whitelists cloud fields and deep copies arrays', () => {
    const draft = { ...emptyPlanner('local'), title: '  Build  ', recovery: [{ secret: 1 }], original: { secret: 2 } }
    const payload = buildPayload(draft)
    expect(payload).not.toHaveProperty('recovery')
    expect(payload).not.toHaveProperty('original')
    expect(payload).not.toHaveProperty('id')
    expect(payload.title).toBe('Build')
    payload.attributes[0] = 20
    expect(draft.attributes[0]).toBe(1)
  })
  it('creates independent editable state from server data', () => {
    const server = { id: 'server-id', revision: 2, publishedRevision: null, editable: true, favorited: false, data: buildPayload(emptyPlanner()) }
    const edited = editableBuild(server)
    edited.skills.push(12)
    expect(server.data.skills).toEqual([])
    expect(edited.id).toBe('server-id')
    expect(edited.recovery).toEqual([])
  })
  it('encodes share ids and does not carry private page parameters', () => {
    const link = new URL(publicBuildLink('a&other=private', 'https://ro3.example'))
    expect(link.pathname).toBe('/builds')
    expect(link.searchParams.get('build')).toBe('a&other=private')
    expect([...link.searchParams.keys()]).toEqual(['build'])
  })
  it('honors and releases the in-memory dirty navigation guard', () => {
    const release = registerBuildNavigationGuard(() => false)
    expect(canLeaveBuild()).toBe(false)
    release()
    expect(canLeaveBuild()).toBe(true)
  })
})
