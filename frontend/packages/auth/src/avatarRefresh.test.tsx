// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { AuthProvider, useAuth } from './AuthProvider'

afterEach(cleanup)

it('preserves the signed-in account when post-save refresh fails, and allows retry', async () => {
  let fail = false
  let avatarUrl = '/old.webp'
  let auth: ReturnType<typeof useAuth>
  function Probe() { auth = useAuth(); return <span>{auth.status}:{auth.user?.avatarUrl}</span> }
  render(<AuthProvider baseUrl="https://api.example.test" adapter={async (config) => {
    if (fail) throw new Error('Offline')
    return { config, headers: {}, status: 200, statusText: 'OK', data: {
      id: 'account-a', uid: 10001, specialUid: null, name: 'Reader', email: 'reader@example.test', avatarUrl,
      isActive: true, isVerified: true, isSuperuser: false,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    } }
  }}><Probe /></AuthProvider>)
  await waitFor(() => expect(auth!.status).toBe('authenticated'))
  fail = true
  await act(async () => {
    await expect(auth!.refresh({ preserveOnError: true, expectedUserId: 'account-a' })).rejects.toThrow()
  })
  expect(auth!.status).toBe('authenticated')
  expect(auth!.user?.avatarUrl).toBe('/old.webp')
  fail = false
  avatarUrl = '/new.webp'
  await act(async () => { await auth!.refresh({ preserveOnError: true, expectedUserId: 'account-a' }) })
  expect(auth!.user?.avatarUrl).toBe('/new.webp')
})
