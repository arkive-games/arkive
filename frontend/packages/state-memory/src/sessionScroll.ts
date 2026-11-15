import { useMemo } from 'react'
import { browserMemory, getMemoryKey, type MemoryClient, type MemoryRecord } from './core'

export interface SessionScrollContext {
  scope: string
  ready: boolean
  resultsKey?: string
}

/** Bind only position and readiness; the page shell owns DOM restoration. */
export function sessionScrollBinding(record: MemoryRecord<number>, context: SessionScrollContext, client: MemoryClient = browserMemory) {
  const partition = JSON.stringify([context.scope, context.resultsKey ?? ''])
  const scope = { partition }
  return {
    key: getMemoryKey(record, scope),
    read: () => client.read(record, scope),
    write: (top: number) => { client.write(record, top, scope) },
  }
}

export function useSessionScroll(record: MemoryRecord<number>, context?: SessionScrollContext) {
  const section = context?.scope ?? ''
  const resultsKey = context?.resultsKey ?? ''
  const binding = useMemo(() => sessionScrollBinding(record, { scope: section, resultsKey, ready: false }), [record, section, resultsKey])
  return context ? { ...binding, ready: context.ready } : undefined
}
