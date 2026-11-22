// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { ApiError } from '@gamemap/api-core'
import { ContentModerationPage } from './ContentModerationPage'
import { ContentModerationWorkspace } from './moderation/ContentModerationWorkspace'
import { createModerationFixture } from './dev/moderation-fixture'
import type { ModerationGateway, QueueEntry } from './moderation/model'
import copy from './contentModerationLocale.json'
import legacyCopy from './moderationLocale.json'

const session = vi.hoisted(() => ({ access: 'allowed', user: { id: 'admin', isSuperuser: true } as { id: string; isSuperuser: boolean } | null }))
const legacy = vi.hoisted(() => ({ listPendingMarkerImages: vi.fn(), reviewMarkerImage: vi.fn() }))
vi.mock('@gamemap/auth', () => ({
  useAuth: () => ({ enabled: true, user: session.user, client: { requestClient: {} } }),
  useModerationAccess: () => ({ status: session.access, retry: vi.fn() }),
}))
vi.mock('@gamemap/api-core', async original => ({ ...await original<object>(), ...legacy, result: (value: unknown) => value }))
const i18n = createInstance()
await i18n.use(initReactI18next).init({ lng: 'en-US', resources: { 'en-US': { translation: { contentModeration: copy['en-US'], moderation: legacyCopy['en-US'] } } }, interpolation: { escapeValue: false } })
const wrap = (children: React.ReactNode) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
const page = (gateway: ModerationGateway | null, administrator = true) => wrap(<ContentModerationWorkspace gateway={gateway} siteAdministrator={administrator} />)
const openFirst = async (ui: ReturnType<typeof render>) => {
  await waitFor(() => expect(ui.getAllByTestId('content-review-row').length).toBeGreaterThan(0))
  fireEvent.click(within(ui.getAllByTestId('content-review-row')[0]).getByRole('button'))
}
const loadPreviews = (ui: ReturnType<typeof render>) => within(ui.getByRole('dialog')).getAllByRole('img').forEach(image => fireEvent.load(image))
const select = (ui: ReturnType<typeof render>, name: string, option: string) => {
  fireEvent.keyDown(ui.getByRole('combobox', { name }), { key: 'ArrowDown' })
  fireEvent.click(ui.getByRole('option', { name: option }))
}

beforeEach(() => {
  vi.clearAllMocks()
  session.access = 'allowed'; session.user = { id: 'admin', isSuperuser: true }
  window.history.replaceState(null, '', '/')
  legacy.listPendingMarkerImages.mockResolvedValue({ count: 1, results: [{ id: 'old', url: '/old.png', author: { name: 'Legacy author' }, createdAt: '2026-10-01T00:00:00Z', game: 'aion2', map: 'World', marker: 'one' }] })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.hasPointerCapture = () => false
})
afterEach(cleanup)

describe('unified content review', () => {
  it.each(['anonymous', 'forbidden'])('protects the route for %s visitors', access => {
    session.access = access
    const ui = render(wrap(<ContentModerationPage onSignIn={vi.fn()} />))
    expect(ui.queryByTestId('content-review-queue')).toBeNull()
    expect(legacy.listPendingMarkerImages).not.toHaveBeenCalled()
  })

  it('keeps unbound workflows distinct from an empty queue and legacy images read-only', async () => {
    const ui = render(wrap(<ContentModerationPage onSignIn={vi.fn()} />))
    expect(ui.getByTestId('moderation-integration-pending')).toBeTruthy()
    expect(ui.queryByTestId('content-review-empty')).toBeNull()
    fireEvent.click(ui.getAllByRole('button', { name: 'Legacy images' })[0])
    await waitFor(() => expect(ui.getByText('Legacy author')).toBeTruthy())
    expect(ui.queryByRole('button', { name: copy['en-US'].approve })).toBeNull()
    expect(legacy.reviewMarkerImage).not.toHaveBeenCalled()
    session.user = null; session.access = 'anonymous'
    ui.rerender(wrap(<ContentModerationPage onSignIn={vi.fn()} />))
    expect(ui.queryByText('Legacy author')).toBeNull()
  })

  it('requires every attachment before approving the exact complete revision', async () => {
    const gateway = createModerationFixture('en-US', true)
    const save = vi.spyOn(gateway, 'decideContent')
    const ui = render(page(gateway))
    await openFirst(ui)
    const detail = within(ui.getByRole('dialog'))
    expect(detail.getByText(/Follow the small path/)).toBeTruthy()
    expect(detail.getAllByRole('img')).toHaveLength(2)
    fireEvent.load(detail.getAllByRole('img')[0])
    expect(detail.getByRole('button', { name: copy['en-US'].approve }).hasAttribute('disabled')).toBe(true)
    fireEvent.error(detail.getAllByRole('img')[1])
    expect(detail.getByText(copy['en-US'].imageFailed)).toBeTruthy()
    fireEvent.click(detail.getByRole('button', { name: copy['en-US'].imageRetry }))
    fireEvent.load(detail.getAllByRole('img')[1])
    fireEvent.click(detail.getByRole('button', { name: copy['en-US'].approve }))
    fireEvent.click(detail.getByRole('button', { name: copy['en-US'].confirmApprove }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'map-one', expectedRevision: 'candidate-2', decision: 'approve', qualificationCredit: true }))
    expect(legacy.reviewMarkerImage).not.toHaveBeenCalled()
    await waitFor(() => expect(ui.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(ui.getByTestId('content-review-queue'))
  })

  it('returns from a legacy last page when other reviewers shrink the queue', async () => {
    window.history.replaceState(null, '', '/#moderation/images')
    let shrunk = false
    const record = { id: 'older', url: '/old.png', author: { name: 'Remaining older author' }, createdAt: '2026-10-01T00:00:00Z', game: 'aion2', map: 'World', marker: 'one' }
    legacy.listPendingMarkerImages.mockImplementation(async ({ query }: { query: { page: number } }) => {
      if (query.page === 2) { shrunk = true; return { count: 20, results: [] } }
      return { count: shrunk ? 20 : 21, results: [record] }
    })
    const ui = render(wrap(<ContentModerationPage onSignIn={vi.fn()} />))
    await waitFor(() => expect(ui.getByText('Remaining older author')).toBeTruthy())
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].next }))
    await waitFor(() => expect(legacy.listPendingMarkerImages).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(ui.getByText('Remaining older author')).toBeTruthy())
    expect(ui.queryByRole('button', { name: copy['en-US'].next })).toBeNull()
  })

  it('requires an explanation when a qualifying approval does not earn credit', async () => {
    const gateway = createModerationFixture('en-US', true)
    const save = vi.spyOn(gateway, 'decideContent')
    const ui = render(page(gateway))
    await openFirst(ui); loadPreviews(ui)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].approve }))
    fireEvent.click(ui.getByRole('checkbox', { name: copy['en-US'].credit }))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmApprove }))
    expect(ui.getByRole('alert').textContent).toBe(copy['en-US'].noCreditReason)
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].reason }), { target: { value: 'Useful clarification, already credited on the original submission.' } })
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmApprove }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ qualificationCredit: false, reason: expect.stringContaining('already credited') })))
  })

  it('separates a quality rejection from a confirmed violation', async () => {
    const gateway = createModerationFixture('en-US', true)
    const save = vi.spyOn(gateway, 'decideContent')
    const ui = render(page(gateway)); await openFirst(ui)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].reject }))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmReject }))
    expect(save).not.toHaveBeenCalled()
    expect(ui.getByRole('alert').textContent).toBe(copy['en-US'].reasonRequired)
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].reason }), { target: { value: 'Please identify the entrance.' } })
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmReject }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ decision: 'reject', classification: 'quality', evidence: '' })))
  })

  it('requires evidence for an explicit violation finding', async () => {
    const gateway = createModerationFixture('en-US', true)
    const save = vi.spyOn(gateway, 'decideContent')
    const ui = render(page(gateway)); await openFirst(ui)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].reject }))
    select(ui, copy['en-US'].classification, copy['en-US'].ordinary)
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].reason }), { target: { value: 'Repeated promotion.' } })
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmReject }))
    expect(save).not.toHaveBeenCalled()
    expect(ui.getByRole('alert').textContent).toBe(copy['en-US'].evidenceRequired)
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].evidence }), { target: { value: 'Repeated unsolicited promotion in submissions A and B.' } })
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmReject }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ classification: 'ordinary', evidence: expect.stringContaining('A and B') })))
  })

  it('retains form input after failure and blocks stale revision decisions', async () => {
    const gateway = createModerationFixture('en-US', true)
    vi.spyOn(gateway, 'decideContent').mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new ApiError('ConflictError', 'stale', 409))
    const ui = render(page(gateway)); await openFirst(ui)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].reject }))
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].reason }), { target: { value: 'Keep this explanation.' } })
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmReject }))
    await waitFor(() => expect(ui.getByText(copy['en-US'].saveFailed)).toBeTruthy())
    expect((ui.getByRole('textbox', { name: copy['en-US'].reason }) as HTMLTextAreaElement).value).toBe('Keep this explanation.')
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmReject }))
    await waitFor(() => expect(ui.getByText(copy['en-US'].conflict)).toBeTruthy())
    expect(ui.getByRole('button', { name: copy['en-US'].confirmReject }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].reload }))
    await waitFor(() => expect(ui.queryByRole('dialog')).toBeNull())
  })

  it('discards private candidates when the server revokes permission', async () => {
    const gateway = createModerationFixture('en-US', true)
    vi.spyOn(gateway, 'decideContent').mockRejectedValue(new ApiError('PermissionError', 'revoked', 403))
    const ui = render(page(gateway)); await openFirst(ui); loadPreviews(ui)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].approve }))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmApprove }))
    await waitFor(() => expect(ui.getByRole('alert').textContent).toBe(copy['en-US'].forbidden))
    expect(ui.queryByRole('dialog')).toBeNull()
    expect(ui.queryByTestId('content-review-row')).toBeNull()
  })

  it('sends scope and filters before paging without a submission date cutoff', async () => {
    const gateway = createModerationFixture('en-US', true)
    const original = await gateway.list({ section: 'pending', type: 'all', game: 'all', state: 'pending', caseState: 'open', page: 1, pageSize: 20, order: 'oldest' })
    const list = vi.spyOn(gateway, 'list').mockResolvedValue({ count: 61, entries: original.entries })
    const ui = render(page(gateway)); await waitFor(() => expect(ui.getAllByTestId('content-review-row')).toHaveLength(5))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].next }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
    await waitFor(() => expect(ui.getByTestId('content-review-queue').getAttribute('aria-busy')).toBe('false'))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].next }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 3 })))
    await waitFor(() => expect(ui.getByTestId('content-review-queue').getAttribute('aria-busy')).toBe('false'))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].previous }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].forum }))
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ section: 'pending', type: 'forum', game: 'all', state: 'pending', caseState: 'open', page: 1, pageSize: 20, order: 'oldest' }))
    select(ui, copy['en-US'].game, 'palworld')
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ game: 'palworld', page: 1 })))
  })

  it('keeps moderator scope separate from administrator governance', async () => {
    const ui = render(page(createModerationFixture('en-US', false), false))
    await waitFor(() => expect(ui.getAllByTestId('content-review-row')).toHaveLength(3))
    expect(ui.queryByRole('button', { name: copy['en-US'].trust })).toBeNull()
    expect(ui.queryByRole('button', { name: copy['en-US'].profile })).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].rules }))
    expect(ui.getByTestId('publication-rules')).toBeTruthy()
  })

  it('keeps a trusted authors earlier pending replacement in review and preserves the public snapshot', async () => {
    const ui = render(page(createModerationFixture('en-US', true)))
    await waitFor(() => expect(ui.getAllByTestId('content-review-row')).toHaveLength(5))
    fireEvent.click(ui.getByRole('button', { name: 'Review A second entrance route' }))
    expect(ui.getByText(copy['en-US'].queuedReason)).toBeTruthy()
    expect(ui.getByText('Enter using the southern path.')).toBeTruthy()
    loadPreviews(ui); fireEvent.click(ui.getByRole('button', { name: copy['en-US'].approve }))
    expect(ui.getByText(copy['en-US'].revisionExcluded)).toBeTruthy()
    expect(ui.queryByRole('checkbox')).toBeNull()
  })

  it('resolves a report with a reason without issuing a content publication decision', async () => {
    const gateway = createModerationFixture('en-US', true)
    const decideCase = vi.spyOn(gateway, 'decideCase')
    const decideContent = vi.spyOn(gateway, 'decideContent')
    const ui = render(page(gateway))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].reports })); await openFirst(ui)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmDecision }))
    expect(decideCase).not.toHaveBeenCalled()
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].reason }), { target: { value: 'The report is supported by the stored context.' } })
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmDecision }))
    await waitFor(() => expect(decideCase).toHaveBeenCalledWith(expect.objectContaining({ id: 'report-one', expectedRevision: 'case-1', outcome: 'upheld' })))
    expect(decideContent).not.toHaveBeenCalled()
    await waitFor(() => expect(ui.queryByRole('dialog')).toBeNull())
    select(ui, copy['en-US'].status, copy['en-US'].closed)
    await openFirst(ui)
    expect(ui.getByText('The report is supported by the stored context.')).toBeTruthy()
    expect(ui.queryByRole('button', { name: copy['en-US'].confirmDecision })).toBeNull()
  })

  it('blocks an appeal overturn until every candidate preview is available', async () => {
    const gateway = createModerationFixture('en-US', true)
    const save = vi.spyOn(gateway, 'decideCase')
    const ui = render(page(gateway))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].appeals })); await openFirst(ui)
    select(ui, copy['en-US'].status, copy['en-US'].overturned)
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].reason }), { target: { value: 'Reassessed the exact complete submission.' } })
    const images = within(ui.getByRole('dialog')).getAllByRole('img')
    fireEvent.load(images[0]); fireEvent.error(images[1])
    expect(ui.getByRole('button', { name: copy['en-US'].confirmDecision }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmDecision }))
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].imageRetry }))
    fireEvent.load(within(ui.getByRole('dialog')).getAllByRole('img')[1])
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmDecision }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'appeal-one', expectedRevision: 'case-1', outcome: 'overturned' })))
  })

  it('requires an audited reason for administrator trust changes', async () => {
    const gateway = createModerationFixture('en-US', true)
    const save = vi.spyOn(gateway, 'decideTrust')
    const ui = render(page(gateway))
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].trust })); await openFirst(ui)
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmTrust }))
    expect(save).not.toHaveBeenCalled()
    fireEvent.change(ui.getByRole('textbox', { name: copy['en-US'].reason }), { target: { value: 'Verified contributor reviewed by a site administrator.' } })
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].confirmTrust }))
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: 'trust-one', expectedRevision: 'trust-1', action: 'grant', reason: expect.stringContaining('Verified contributor') })))
  })

  it('distinguishes loading and request errors from a real empty scoped result', async () => {
    const gateway = createModerationFixture('en-US', true)
    let finish!: (value: { count: number; entries: QueueEntry[] }) => void
    vi.spyOn(gateway, 'list').mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const ui = render(page(gateway))
    await waitFor(() => expect(ui.getByText(copy['en-US'].loadFailed)).toBeTruthy())
    expect(ui.queryByTestId('content-review-empty')).toBeNull()
    fireEvent.click(ui.getByRole('button', { name: copy['en-US'].retry }))
    expect(ui.queryByTestId('content-review-empty')).toBeNull()
    finish({ count: 0, entries: [] })
    await waitFor(() => expect(ui.getByTestId('content-review-empty')).toBeTruthy())
  })
})
