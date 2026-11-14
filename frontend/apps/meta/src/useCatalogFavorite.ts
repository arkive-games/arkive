import { useRef, useState } from 'react'
import { useAuth } from '@gamemap/auth'

/** Confirm writes before changing appearance or order; failures remain retryable. */
export function useCatalogFavorite(
  write: (id: string) => boolean | Promise<boolean>,
  onAuthRequired: () => void,
) {
  const { status, user } = useAuth()
  const account = status === 'authenticated' ? String(user?.uid) : ''
  const locks = useRef(new Set<string>())
  const [activity, setActivity] = useState({
    account,
    pending: [] as string[],
    failed: [] as string[],
  })
  const current =
    activity.account === account
      ? activity
      : { account, pending: [], failed: [] }
  const toggle = async (id: string) => {
    if (status === 'loading') return
    if (status !== 'authenticated') {
      onAuthRequired()
      return
    }
    const key = `${account}:${id}`
    if (locks.current.has(key)) return
    locks.current.add(key)
    setActivity((previous) => ({
      account,
      pending: [...(previous.account === account ? previous.pending : []), id],
      failed: (previous.account === account ? previous.failed : []).filter(
        (value) => value !== id,
      ),
    }))
    let saved = false
    try {
      saved = await write(id)
    } catch {
      /* The unchanged item exposes retry. */
    }
    locks.current.delete(key)
    setActivity((previous) =>
      previous.account !== account
        ? previous
        : {
            account,
            pending: previous.pending.filter((value) => value !== id),
            failed: saved ? previous.failed : [...previous.failed, id],
          },
    )
  }
  return {
    toggle,
    pending: current.pending,
    failed: current.failed,
    authLoading: status === 'loading',
    authenticated: status === 'authenticated',
  }
}
