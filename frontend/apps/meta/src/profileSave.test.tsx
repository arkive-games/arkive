// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { browserMemory } from '@gamemap/state-memory'
import { AccountCenterPage } from './UserSystemPages'

const localSave = vi.hoisted(() => vi.fn(() => false))
const session = vi.hoisted(() => ({
  enabled: false,
  status: 'authenticated',
  user: { id: 'profile-test-account', uid: 123, name: 'Reader', email: 'reader@example.test', isVerified: true },
  client: { updateCurrentUser: vi.fn() },
  refresh: vi.fn(),
}))
vi.mock('@gamemap/auth', async original => ({ ...await original<object>(), useAuth: () => session }))
vi.mock('./UserSystemState', () => ({ useUserSystem: () => ({ state: { profile: { bio: '' } }, updateLocalProfile: localSave }) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }) }))
afterEach(() => { vi.restoreAllMocks() })

it('keeps the profile draft on refused local persistence and saves only after a successful retry', async () => {
  const clear = vi.spyOn(browserMemory, 'clear')
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<AccountCenterPage section="edit" onLogout={() => {}} onAuthRequired={() => {}} />))
    const bio = container.querySelector<HTMLTextAreaElement>('textarea[name=bio]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(bio, 'Retained profile draft')
      bio.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.querySelector('[role=alert]')).not.toBeNull()
    expect(bio.value).toBe('Retained profile draft')
    expect(container.querySelector('.profile-form-footer [role=status]')).toBeNull()
    expect(clear).not.toHaveBeenCalled()
    localSave.mockReturnValue(true)
    await act(async () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.querySelector('.profile-form-footer [role=status]')).not.toBeNull()
    expect(clear).toHaveBeenCalledOnce()
    expect(session.client.updateCurrentUser).not.toHaveBeenCalled()
  } finally {
    await act(async () => root.unmount())
    container.remove()
  }
})
