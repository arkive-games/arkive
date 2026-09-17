import { useEffect, useState } from 'react'

export type Loaded<T> = { data: T | null; loading: boolean; error: boolean }

/**
 * Load one dataset for a 愚者棋局 page.
 *
 * The five pages differ only in which files they need, so the fetch/loading/
 * error lifecycle lives here rather than five times over. `load` is called once
 * on mount; the `live` flag drops a response that arrives after unmount, which
 * is the usual React strict-mode double-invoke hazard.
 */
export function useAutoChess<T>(load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true, error: false })

  useEffect(() => {
    let live = true
    load()
      .then((data) => {
        if (live) setState({ data, loading: false, error: false })
      })
      .catch((cause) => {
        console.error(cause)
        if (live) setState({ data: null, loading: false, error: true })
      })
    return () => {
      live = false
    }
    // `load` is a module-level function per page; re-running on identity would
    // refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
