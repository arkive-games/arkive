// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { ApiError } from '@gamemap/api-core'
import { MarkerImageModerationPage } from './MarkerImageModerationPage'
import copy from './moderationLocale.json'

const api = vi.hoisted(() => ({ listPendingMarkerImages: vi.fn(), reviewMarkerImage: vi.fn() }))
const session = vi.hoisted(() => ({ access: 'allowed', user: { id: 'admin' } as { id: string } | null, client: {} }))
vi.mock('@gamemap/api-core', async (original) => ({ ...await original<object>(), ...api, result: (value: unknown) => value }))
vi.mock('@gamemap/auth', () => ({
  useAuth: () => ({ enabled: true, user: session.user, client: { requestClient: session.client } }),
  useModerationAccess: () => ({ status: session.access, retry: vi.fn() }),
}))
const i18n = createInstance()
await i18n.use(initReactI18next).init({ lng: 'en-US', resources: { 'en-US': { translation: { moderation: copy['en-US'] } } }, interpolation: { escapeValue: false } })
const image = (id: string, author = 'Map player') => ({ id, url: '/stored.png', width: 128, height: 64, game: 'aion2', map: 'World_L_B', marker: 'World_L_B-fragments-11', author: { name: author }, createdAt: '2026-11-19T00:00:00Z' })
const signIn = vi.fn()
const page = () => <I18nextProvider i18n={i18n}><MarkerImageModerationPage onSignIn={signIn} /></I18nextProvider>

beforeEach(() => {
  vi.clearAllMocks()
  session.access = 'allowed'
  session.user = { id: 'admin' }
  api.listPendingMarkerImages.mockResolvedValue({ count: 1, results: [image('first')] })
  api.reviewMarkerImage.mockResolvedValue(image('first'))
})
afterEach(cleanup)

describe('standalone image moderation', () => {
  it.each(['anonymous', 'forbidden'])('blocks the queue for %s accounts', (access) => {
    session.access = access
    if (access === 'anonymous') session.user = null
    const ui = render(page())
    expect(api.listPendingMarkerImages).not.toHaveBeenCalled()
    if (access === 'anonymous') {
      fireEvent.click(ui.getByRole('button', { name: 'Sign in' }))
      expect(signIn).toHaveBeenCalledOnce()
    } else expect(ui.getByRole('alert').textContent).toContain(copy['en-US'].forbidden)
  })

  it('distinguishes a pending queue request from an empty queue', async () => {
    let finish!: (value: unknown) => void
    api.listPendingMarkerImages.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const ui = render(page())
    expect(ui.getByRole('status', { name: copy['en-US'].loading })).toBeTruthy()
    expect(ui.queryByText(copy['en-US'].empty)).toBeNull()
    finish({ count: 0, results: [] })
    await waitFor(() => expect(ui.getByText(copy['en-US'].empty)).toBeTruthy())
  })

  it('keeps an image after a failed review and removes it only after confirmation', async () => {
    api.reviewMarkerImage.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(image('first'))
    const ui = render(page())
    await waitFor(() => expect(ui.getByTestId('image-review-card')).toBeTruthy())
    fireEvent.click(within(ui.getByTestId('image-review-card')).getByRole('button'))
    fireEvent.load(within(ui.getByTestId('image-review-detail')).getByRole('img'))
    fireEvent.click(ui.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(ui.getByRole('alert').textContent).toContain(copy['en-US'].reviewFailed))
    expect(ui.getByTestId('image-review-card')).toBeTruthy()
    api.listPendingMarkerImages.mockResolvedValue({ count: 0, results: [] })
    fireEvent.click(ui.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(ui.queryByTestId('image-review-card')).toBeNull())
    expect(api.reviewMarkerImage).toHaveBeenLastCalledWith(expect.objectContaining({ path: { id: 'first' }, body: { publish: true } }))
  })

  it('discards the private queue immediately on sign out', async () => {
    const ui = render(page())
    await waitFor(() => expect(ui.getByTestId('image-review-card')).toBeTruthy())
    fireEvent.click(within(ui.getByTestId('image-review-card')).getByRole('button'))
    expect(ui.getByRole('dialog')).toBeTruthy()
    session.user = null
    session.access = 'anonymous'
    ui.rerender(page())
    expect(ui.queryAllByText('Map player')).toHaveLength(0)
    expect(ui.queryByTestId('image-review-card')).toBeNull()
  })

  it('clears private cards when a server write reports revoked permissions', async () => {
    api.reviewMarkerImage.mockRejectedValue(new ApiError('PermissionError', 'forbidden', 403))
    const ui = render(page())
    await waitFor(() => expect(ui.getByTestId('image-review-card')).toBeTruthy())
    fireEvent.click(within(ui.getByTestId('image-review-card')).getByRole('button'))
    fireEvent.click(ui.getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe(copy['en-US'].forbidden))
    expect(ui.queryByTestId('image-review-card')).toBeNull()
  })

  it('returns to the previous page after reviewing the final item on the last page', async () => {
    let removed = false
    const firstPage = Array.from({ length: 20 }, (_, index) => image(`first-${index}`, `Player ${index}`))
    api.listPendingMarkerImages.mockImplementation(async ({ query }: { query: { page: number } }) => ({
      count: removed ? 20 : 21,
      results: query.page === 1 ? firstPage : removed ? [] : [image('last', 'Last player')],
    }))
    api.reviewMarkerImage.mockImplementation(async () => { removed = true; return image('last') })
    const ui = render(page())
    await waitFor(() => expect(ui.getAllByTestId('image-review-card')).toHaveLength(20))
    fireEvent.click(ui.getByRole('button', { name: 'Next' }))
    await waitFor(() => expect(ui.getByTestId('image-review-card')).toBeTruthy())
    fireEvent.click(within(ui.getByTestId('image-review-card')).getByRole('button'))
    expect(within(ui.getByTestId('image-review-detail')).getByRole('heading', { name: 'Last player' })).toBeTruthy()
    fireEvent.click(within(ui.getByTestId('image-review-detail')).getByRole('button', { name: 'Reject' }))
    await waitFor(() => expect(ui.getAllByTestId('image-review-card')).toHaveLength(20))
    expect(ui.queryAllByText('Last player')).toHaveLength(0)
    expect(ui.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it('selects an older pending image and advances after its confirmed review', async () => {
    const records = [image('first', 'First player'), { ...image('older', 'Earlier player'), url: '/earlier.png', createdAt: '2026-10-01T00:00:00Z', commentId: 'comment' }, image('third', 'Next player')]
    api.listPendingMarkerImages.mockImplementation(async () => ({ count: records.length, results: [...records] }))
    api.reviewMarkerImage.mockImplementation(async () => { records.splice(1, 1); return image('older') })
    const ui = render(page())
    await waitFor(() => expect(ui.getAllByTestId('image-review-card')).toHaveLength(3))
    const entry = ui.getByRole('button', { name: 'Review image from Earlier player' })
    fireEvent.click(entry)
    const detail = within(ui.getByTestId('image-review-detail'))
    expect(detail.getByRole('heading', { name: 'Earlier player' })).toBeTruthy()
    expect(detail.getByText(copy['en-US'].commentImage)).toBeTruthy()
    expect(entry.getAttribute('aria-expanded')).toBe('true')
    expect(detail.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
    fireEvent.load(detail.getByRole('img'))
    fireEvent.click(detail.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(detail.getByRole('heading', { name: 'Next player' })).toBeTruthy())
    expect(detail.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
    fireEvent.load(detail.getByRole('img'))
    await waitFor(() => expect(detail.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(false))
    expect(api.reviewMarkerImage).toHaveBeenCalledWith(expect.objectContaining({ path: { id: 'older' }, body: { publish: true } }))
    expect(api.listPendingMarkerImages).toHaveBeenCalledWith(expect.objectContaining({ query: { page: 1, pageSize: 20 } }))
  })

  it('shows a recoverable request failure instead of the empty explanation', async () => {
    api.listPendingMarkerImages.mockRejectedValueOnce(new Error('offline'))
    const ui = render(page())
    await waitFor(() => expect(ui.getByRole('alert').textContent).toContain(copy['en-US'].loadFailed))
    expect(ui.queryByTestId('image-review-empty')).toBeNull()
    api.listPendingMarkerImages.mockResolvedValue({ count: 0, results: [] })
    fireEvent.click(ui.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(ui.getByTestId('image-review-empty')).toBeTruthy())
    expect(ui.getByText(copy['en-US'].emptyScope)).toBeTruthy()
    expect(ui.getByText(copy['en-US'].emptyHint)).toBeTruthy()
  })

  it('blocks approval of a failed preview and lets the reviewer reload it', async () => {
    const ui = render(page())
    await waitFor(() => expect(ui.getByTestId('image-review-card')).toBeTruthy())
    fireEvent.click(within(ui.getByTestId('image-review-card')).getByRole('button'))
    const detail = within(ui.getByTestId('image-review-detail'))
    fireEvent.error(detail.getByRole('img'))
    expect(detail.getByRole('alert').textContent).toContain(copy['en-US'].imageFailed)
    expect(detail.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
    expect(api.reviewMarkerImage).not.toHaveBeenCalled()
    fireEvent.click(detail.getByRole('button', { name: 'Retry' }))
    expect(detail.getByRole('img')).toBeTruthy()
    expect(detail.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(true)
    fireEvent.load(detail.getByRole('img'))
    expect(detail.getByRole('button', { name: 'Approve' }).hasAttribute('disabled')).toBe(false)
  })

  it('keeps review details closed until selected and restores focus after dismissal', async () => {
    const ui = render(page())
    await waitFor(() => expect(ui.getByTestId('image-review-card')).toBeTruthy())
    expect(ui.queryByRole('dialog')).toBeNull()
    expect(ui.queryByTestId('image-review-detail')).toBeNull()
    const entry = within(ui.getByTestId('image-review-card')).getByRole('button')
    fireEvent.click(entry)
    expect(ui.getByRole('dialog')).toBeTruthy()
    fireEvent.click(ui.getByRole('button', { name: 'Close review' }))
    await waitFor(() => expect(ui.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(entry)
  })

  it.each([1, 2])('keeps focus stable through a delayed refresh after reviewing one of %s images', async (count) => {
    const next = image('next', 'Next player')
    let finishRefresh!: (value: unknown) => void
    api.listPendingMarkerImages.mockResolvedValueOnce({ count, results: [image('first'), next].slice(0, count) })
      .mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    const ui = render(page())
    await waitFor(() => expect(ui.getAllByTestId('image-review-card')).toHaveLength(count))
    fireEvent.click(within(ui.getAllByTestId('image-review-card')[0]).getByRole('button'))
    fireEvent.load(within(ui.getByTestId('image-review-detail')).getByRole('img'))
    fireEvent.click(ui.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(api.listPendingMarkerImages).toHaveBeenCalledTimes(2))
    if (count === 2) {
      expect(ui.getByRole('heading', { name: 'Next player' })).toBeTruthy()
      fireEvent.click(ui.getByRole('button', { name: 'Close review' }))
    }
    await waitFor(() => expect(ui.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(ui.getByTestId('image-review-queue'))
    finishRefresh({ count: count - 1, results: count === 2 ? [next] : [] })
    await waitFor(() => expect(ui.getByTestId('image-review-queue').getAttribute('aria-busy')).toBe('false'))
    expect(document.activeElement).toBe(ui.getByTestId('image-review-queue'))
  })
})
