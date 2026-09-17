import { useEffect, useState } from 'react'

export type Loaded<T> = { data: T | null; loading: boolean; error: boolean }

/**
 * Load one dataset for a catalogue page.
 *
 * The 愚者棋局 and 人脉 pages differ only in which files they need, so the
 * fetch/loading/error lifecycle lives here rather than once per page. `load` is
 * called on mount only; the `live` flag drops a response that arrives after
 * unmount, which is the usual strict-mode double-invoke hazard.
 */
export function useRemoteData<T>(load: () => Promise<T>): Loaded<T> {
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
    // `load` is a module-level function per page; keying on its identity would
    // refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return state
}
