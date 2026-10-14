// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { ArkiveAccountControl } from './ArkiveAccountControl'

afterEach(cleanup)

it('offers profile, local website settings and sign out behind the uploaded avatar', async () => {
  const settings = vi.fn()
  const view = render(<AuthProvider baseUrl="https://api.example.test" adapter={async (config) => ({
    config, headers: {}, status: 200, statusText: 'OK', data: {
      id: 'reader', uid: 10001, specialUid: null, name: 'Reader', email: 'reader@example.test', avatarUrl: '/uploaded.webp',
      isActive: true, isVerified: true, isSuperuser: false,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    },
  })}><ArkiveAccountControl language="en-US" homeUrl="http://localhost:15172" onOpenSettings={settings} /></AuthProvider>)
  await waitFor(() => expect(view.getByTestId('account-menu')).toBeTruthy())
  expect(view.getByTestId('account-menu').querySelector('img')?.getAttribute('src')).toBe('/uploaded.webp')
  fireEvent.click(view.getByTestId('account-menu'))
  expect(view.getAllByRole('menuitem').map(e => e.textContent)).toEqual(['My profile', 'Website settings', 'Sign out'])
  fireEvent.click(view.getByTestId('account-settings'))
  expect(settings).toHaveBeenCalledOnce()
})
