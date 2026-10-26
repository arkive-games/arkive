import { ApiError, createApiClient, type ApiClient } from '@gamemap/api-core'
import { createLocalTokenStorage, CORE_API_PREFIX } from '@gamemap/auth'

import type { Envelope } from '@/features/characters/envelope'
import { AUTH_CONFIG } from '@/lib/auth'

/**
 * The saved-character surface of the backend's gmzz module.
 *
 * Hand-written over the shared transport rather than generated: the generated
 * client in `@gamemap/api-core` is core's alone, and these seven calls are not
 * worth a second generated package. The transport is the same one the account
 * control uses — cookie on the game subdomains, bearer token in a Toy — and the
 * response interceptor unwraps the envelope and raises `ApiError`, so a call
 * here returns its payload or throws exactly as a generated one would. The wire
 * shapes mirror `backend-go/openapi/gmzz.json`.
 */

export type Visibility = 'private' | 'link'

export type CharacterSummary = {
  id: string
  name: string
  /** A player server's id from `servers/servers.json`. */
  serverId?: number
  uid?: string
  showUid: boolean
  visibility: Visibility
  schemaVersion: number
  revision: number
  createdAt: string
  updatedAt: string
}

export type SavedCharacter = CharacterSummary & {
  /** True when the caller owns it. */
  editable: boolean
  data: Envelope
}

export type CharacterMeta = {
  name?: string
  /** 0 clears it. */
  serverId?: number
  uid?: string
  showUid?: boolean
  visibility?: Visibility
}

/** Server error codes this feature branches on. */
export const LIMIT_REACHED = 'CharacterLimitReachedError'
export const REVISION_CONFLICT = 'CharacterRevisionConflictError'

/** An account holds at most this many; the server enforces it. */
export const MAX_CHARACTERS = 10

export function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.code === REVISION_CONFLICT
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/** A disabled account: as unable to write as a signed-out one. */
export function isInactive(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'UserInactiveError'
}

export function isLimitReached(error: unknown): boolean {
  return error instanceof ApiError && error.code === LIMIT_REACHED
}

export interface CharacterApi {
  list(): Promise<CharacterSummary[]>
  get(id: string): Promise<SavedCharacter>
  create(input: CharacterMeta & { name: string; data: Envelope }): Promise<SavedCharacter>
  update(id: string, patch: CharacterMeta & { revision: number; data?: Envelope }): Promise<SavedCharacter>
  remove(id: string): Promise<void>
  copy(id: string, name?: string): Promise<SavedCharacter>
  reorder(ids: string[]): Promise<void>
}

export function createCharacterApi(client: ApiClient): CharacterApi {
  const http = client.axios
  const path = (id: string) => `/characters/${encodeURIComponent(id)}`
  return {
    list: async () => (await http.get<CharacterSummary[]>('/characters')).data,
    get: async (id) => (await http.get<SavedCharacter>(path(id))).data,
    create: async (input) => (await http.post<SavedCharacter>('/characters', input)).data,
    update: async (id, patch) => (await http.patch<SavedCharacter>(path(id), patch)).data,
    remove: async (id) => {
      await http.delete(path(id))
    },
    copy: async (id, name) => (await http.post<SavedCharacter>(`${path(id)}/copy`, name ? { name } : {})).data,
    reorder: async (ids) => {
      await http.put('/characters/order', { ids })
    },
  }
}

/** The gmzz module sits beside core under the same API prefix. */
export function gmzzBaseUrl(coreBaseUrl: string): string {
  const base = coreBaseUrl.replace(/\/+$/, '')
  const modulePrefix = CORE_API_PREFIX.replace(/\/core$/, '/gmzz')
  return base.endsWith(CORE_API_PREFIX) ? base.slice(0, -CORE_API_PREFIX.length) + modulePrefix : base
}

let shared: CharacterApi | null = null

/** The app's client, or null when this build has no API configured. */
export function characterApi(): CharacterApi | null {
  if (!AUTH_CONFIG.enabled) return null
  if (!shared) {
    shared = createCharacterApi(createApiClient({
      baseUrl: gmzzBaseUrl(AUTH_CONFIG.baseUrl),
      transport: AUTH_CONFIG.transport,
      // The same key the account control writes, so a Toy's sign-in reaches here.
      ...(AUTH_CONFIG.transport === 'bearer' ? { storage: createLocalTokenStorage() } : {}),
    }))
  }
  return shared
}
