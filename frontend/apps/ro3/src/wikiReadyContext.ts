import { createContext } from 'react'

export const WikiReadyContext = createContext<{
  section: string
  ready: boolean
  markReady: (section: string) => void
}>({ section: '', ready: false, markReady: () => undefined })
