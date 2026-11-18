// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markerDetailLabelsFor } from '@gamemap/map-shell'
import { CommunityMarkerDetail } from './CommunityMarkerDetail'

const api = vi.hoisted(() => ({
  listMarkerComments: vi.fn(), listMarkerImages: vi.fn(), createMarkerComment: vi.fn(),
  createMarkerCommentWithImages: vi.fn(), uploadMarkerImage: vi.fn(), listOwnRoles: vi.fn(),
  listMarkerCommentReplies: vi.fn(), likeMarkerComment: vi.fn(), updateMarkerComment: vi.fn(),
  deleteMarkerComment: vi.fn(), reportMarkerComment: vi.fn(), listPendingMarkerImages: vi.fn(), reviewMarkerImage: vi.fn(),
}))
const session = vi.hoisted(() => ({ viewer: { id: 'writer', uid: 10000, isSuperuser: false } as { id: string; uid: number; isSuperuser: boolean } | null, client: {} }))
vi.mock('@gamemap/api-core', () => ({ ...api, result: (value: unknown) => value }))
vi.mock('@gamemap/auth', () => ({ useOptionalAuth: () => ({ enabled: true, user: session.viewer, client: { requestClient: session.client } }) }))

const labels = markerDetailLabelsFor('en-US')
const author = { uid: 10000, name: 'Map writer', avatarUrl: '/avatar.png' }
const comment = { id: 'saved-comment', marker: 'chest-1', author, body: 'Use the north entrance.', parentId: null, likeCount: 0, liked: false, replyCount: 0, createdAt: '2026-11-19T00:00:00Z', editedAt: null }
const image = { id: 'saved-image', commentId: comment.id, position: 0, marker: 'chest-1', author, status: 'pending', url: '/stored-image.png', createdAt: '2026-11-19T00:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  session.viewer = { id: 'writer', uid: 10000, isSuperuser: false }
  api.listMarkerComments.mockResolvedValue({ count: 0, results: [] })
  api.listMarkerImages.mockResolvedValue({ count: 0, results: [] })
  api.listOwnRoles.mockResolvedValue({ count: 0, results: [] })
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function detail(game: 'aion2' | 'palworld' | 'vrising' | 'pbz' = 'palworld', markerId = 'chest-1') {
  return <CommunityMarkerDetail game={game} mapId="MainWorld" markerId={markerId} language="en-US" name="Map chest" labels={labels} onClose={vi.fn()} />
}

describe('server-backed marker contributions', () => {
  it.each(['aion2', 'palworld', 'vrising', 'pbz'] as const)('publishes %s comments and reads them again after remount', async (game) => {
    api.createMarkerComment.mockResolvedValue(comment)
    const ui = render(detail(game))
    fireEvent.click(ui.getByRole('tab', { name: /Comments/ }))
    await waitFor(() => expect(ui.queryByTestId('marker-comments-loading')).toBeNull())
    fireEvent.change(ui.getByTestId('marker-comment-body'), { target: { value: comment.body } })
    fireEvent.click(ui.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(ui.getByText(comment.body, { selector: 'article p' })).not.toBeNull())
    expect(api.createMarkerComment).toHaveBeenCalledWith(expect.objectContaining({ body: { game, map: 'MainWorld', marker: 'chest-1', body: comment.body } }))
    ui.unmount()
    api.listMarkerComments.mockResolvedValue({ count: 1, results: [comment] })
    const reloaded = render(detail(game))
    fireEvent.click(reloaded.getByRole('tab', { name: /Comments/ }))
    await waitFor(() => expect(reloaded.getByText(comment.body, { selector: 'article p' })).not.toBeNull())
  })

  it('keeps a failed attachment submission as a draft, then displays server-owned pending images', async () => {
    api.createMarkerCommentWithImages.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ comment, images: [image] })
    const ui = render(detail())
    fireEvent.click(ui.getByRole('tab', { name: /Comments/ }))
    await waitFor(() => expect(ui.queryByTestId('marker-comments-loading')).toBeNull())
    const file = new File(['image bytes'], 'entrance.png', { type: 'image/png' })
    fireEvent.change(ui.getByTestId('marker-comment-body'), { target: { value: comment.body } })
    fireEvent.change(ui.getByTestId('marker-comment-attachment'), { target: { files: [file] } })
    fireEvent.click(ui.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(ui.getByTestId('marker-comment-submit-error').textContent).toBe(labels.commentFailed))
    expect((ui.getByTestId('marker-comment-body') as HTMLTextAreaElement).value).toBe(comment.body)
    expect(ui.getByAltText('entrance.png')).not.toBeNull()
    expect(ui.queryByText(comment.body, { selector: 'article p' })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(ui.getByText(labels.awaitingReview)).not.toBeNull())
    expect(ui.container.querySelector('article img[src="/stored-image.png"]')).not.toBeNull()
    expect(api.createMarkerComment).not.toHaveBeenCalled()
    expect(api.createMarkerCommentWithImages).toHaveBeenLastCalledWith(expect.objectContaining({ body: { body: comment.body, parentId: '', files: [file] } }))
  })

  it('blocks guest writes and never creates a local substitute', async () => {
    session.viewer = null
    const ui = render(detail())
    fireEvent.click(ui.getByRole('tab', { name: /Comments/ }))
    await waitFor(() => expect(ui.queryByTestId('marker-comments-loading')).toBeNull())
    fireEvent.change(ui.getByTestId('marker-comment-body'), { target: { value: 'Guest draft' } })
    fireEvent.click(ui.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(ui.getByTestId('marker-comment-submit-error').textContent).toBe(labels.signInRequired))
    expect(api.createMarkerComment).not.toHaveBeenCalled()
    expect(ui.queryByText('Guest draft', { selector: 'article p' })).toBeNull()
  })

  it('discards an old marker response after switching targets', async () => {
    let finish!: (value: unknown) => void
    api.listMarkerComments.mockReturnValueOnce(new Promise((resolve) => { finish = resolve })).mockResolvedValue({ count: 0, results: [] })
    const ui = render(detail())
    ui.rerender(detail('palworld', 'chest-2'))
    finish({ count: 1, results: [comment] })
    fireEvent.click(ui.getByRole('tab', { name: /Comments/ }))
    await waitFor(() => expect(ui.queryByTestId('marker-comments-loading')).toBeNull())
    expect(ui.queryByText(comment.body)).toBeNull()
  })

  it('hides private images when guest reads race the logout cookie response', async () => {
    api.listMarkerComments.mockResolvedValue({ count: 1, results: [comment] })
    api.listMarkerImages.mockResolvedValue({ count: 1, results: [image] })
    const ui = render(detail())
    fireEvent.click(ui.getByRole('tab', { name: /Comments/ }))
    await waitFor(() => expect(ui.getByText(labels.awaitingReview)).not.toBeNull())
    session.viewer = null
    ui.rerender(detail())
    fireEvent.click(ui.getByRole('tab', { name: /Comments/ }))
    await waitFor(() => expect(ui.queryByTestId('marker-comments-loading')).toBeNull())
    expect(ui.queryByText(labels.awaitingReview)).toBeNull()
    expect(ui.container.querySelector('article img[src="/stored-image.png"]')).toBeNull()
  })
})
