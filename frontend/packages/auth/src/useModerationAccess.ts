import { useCallback, useEffect, useState } from 'react'
import { listOwnRoles, result } from '@gamemap/api-core'
import { useAuth } from './AuthProvider'

export type ModerationAccessStatus = 'anonymous' | 'checking' | 'allowed' | 'forbidden' | 'error'

/** Menu visibility is advisory; every moderation endpoint enforces its scope. */
export function useModerationAccess() {
  const auth = useAuth()
  const userId = auth.user?.id ?? null
  const superuser = Boolean(auth.user?.isSuperuser && auth.user.isActive)
  const [revision, setRevision] = useState(0)
  const [snapshot, setSnapshot] = useState<{ userId: string; revision: number; status: ModerationAccessStatus } | null>(null)
  const retry = useCallback(() => setRevision((value) => value + 1), [])
  const client = auth.client.requestClient

  useEffect(() => {
    if (!auth.enabled || auth.status !== 'authenticated' || !userId || superuser) return
    let active = true
    void result(listOwnRoles({ client, throwOnError: true })).then((data) => {
      if (active) setSnapshot({ userId, revision, status: data.results?.length ? 'allowed' : 'forbidden' })
    }).catch(() => {
      if (active) setSnapshot({ userId, revision, status: 'error' })
    })
    return () => { active = false }
  }, [auth.enabled, auth.status, client, userId, superuser, revision])

  let status: ModerationAccessStatus
  if (!auth.enabled) status = 'anonymous'
  else if (auth.status === 'loading') status = 'checking'
  else if (!userId || auth.status !== 'authenticated') status = 'anonymous'
  else if (superuser) status = 'allowed'
  else status = snapshot?.userId === userId && snapshot.revision === revision ? snapshot.status : 'checking'
  return { status, retry }
}
