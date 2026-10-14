import { describe, expect, it } from 'vitest'
import { createApiClient } from '@gamemap/api-core'
import { AVATAR_PRESETS } from './avatarPresets'
import { saveAccountAvatar } from './saveAvatar'

describe('account avatar persistence', () => {
  it('sends a selected preset ID through the authenticated transport', async () => {
    let called = false
    const { client } = createApiClient({ baseUrl: 'https://api.example.test', transport: 'cookie', adapter: async (config) => {
      called = true
      expect(config.url).toBe('https://api.example.test/users/me/avatar/preset')
      expect(config.method).toBe('put')
      expect(config.withCredentials).toBe(true)
      expect(JSON.parse(config.data)).toEqual({ presetId: AVATAR_PRESETS[0].id })
      return { data: { avatarUrl: '/preset.png' }, status: 200, statusText: 'OK', headers: {}, config }
    } })
    await saveAccountAvatar(client, AVATAR_PRESETS[0].src)
    expect(called).toBe(true)
  })

  it('uploads cropped bytes in the multipart file field', async () => {
    let called = false
    const { client } = createApiClient({ baseUrl: 'https://api.example.test', adapter: async (config) => {
      called = true
      expect(config.url).toBe('https://api.example.test/users/me/avatar')
      const file = (config.data as FormData).get('file') as File
      expect(file.type).toBe('image/webp')
      expect(await file.text()).toBe('test')
      return { data: { avatarUrl: '/new.webp' }, status: 200, statusText: 'OK', headers: {}, config }
    } })
    await saveAccountAvatar(client, 'data:image/webp;base64,dGVzdA==')
    expect(called).toBe(true)
  })

  it('propagates server failure', async () => {
    const { client } = createApiClient({ baseUrl: 'https://api.example.test', adapter: async () => { throw new Error('Upload failed') } })
    await expect(saveAccountAvatar(client, AVATAR_PRESETS[0].src)).rejects.toThrow('Upload failed')
  })

  it('does not mutate an account when the ownership check fails', async () => {
    let called = false
    const { client } = createApiClient({ baseUrl: 'https://api.example.test', adapter: async () => { called = true; throw new Error('Unexpected request') } })
    await expect(saveAccountAvatar(client, AVATAR_PRESETS[0].src, async () => { throw new Error('Account changed') })).rejects.toThrow('Account changed')
    expect(called).toBe(false)
  })

  it('rejects remote sources without issuing a request', async () => {
    let called = false
    const { client } = createApiClient({ baseUrl: 'https://api.example.test', adapter: async () => { called = true; throw new Error('Unexpected request') } })
    await expect(saveAccountAvatar(client, 'https://untrusted.test/image')).rejects.toThrow('Invalid avatar source')
    expect(called).toBe(false)
  })
})
