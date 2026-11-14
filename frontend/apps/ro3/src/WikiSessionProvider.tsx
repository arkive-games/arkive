import { useMemo, useState, type ReactNode } from 'react'
import { WikiReadyContext } from './wikiReadyContext'

/** Keyed by route so a returning category waits for its newly mounted data. */
export function WikiSessionProvider({
  section,
  children,
}: {
  section: string
  children: ReactNode
}) {
  const [loaded, setLoaded] = useState('')
  const value = useMemo(
    () => ({ section, ready: loaded === section, markReady: setLoaded }),
    [section, loaded],
  )
  return (
    <WikiReadyContext.Provider value={value}>
      {children}
    </WikiReadyContext.Provider>
  )
}
