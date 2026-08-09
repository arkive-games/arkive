import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react"
import {
  browserMemory,
  getMemoryKey,
  type MemoryClient,
  type MemoryRecord,
  type MemoryScope,
} from "./core"

export interface UseMemoryStateOptions extends MemoryScope {
  client?: MemoryClient
  debounceMs?: number
}

export function useMemoryState<T>(
  record: MemoryRecord<T>,
  options: UseMemoryStateOptions = {},
): readonly [T, (action: SetStateAction<T>) => void, () => void] {
  const client = options.client ?? browserMemory
  const scope = useMemo<MemoryScope>(
    () => ({
      accountId: options.accountId,
      viewport: options.viewport,
      partition: options.partition,
    }),
    [options.accountId, options.partition, options.viewport],
  )
  const key = getMemoryKey(record, scope)
  const debounceMs = options.debounceMs ?? 0
  const [value, setValue] = useState<T>(() => client.read(record, scope))
  const valueRef = useRef(value)
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const restored = client.read(record, scope)
    valueRef.current = restored
    setValue(restored)
    return client.subscribe(record, scope, () => {
      const next = client.read(record, scope)
      valueRef.current = next
      setValue(next)
    })
  }, [client, key, record, scope])

  useEffect(() => () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current)
      client.write(record, valueRef.current, scope)
    }
  }, [client, record, scope])

  const update = useCallback((action: SetStateAction<T>) => {
    const next = typeof action === "function"
      ? (action as (current: T) => T)(valueRef.current)
      : action
    valueRef.current = next
    setValue(next)
    if (writeTimer.current) clearTimeout(writeTimer.current)
    if (debounceMs > 0) {
      writeTimer.current = setTimeout(() => {
        writeTimer.current = null
        client.write(record, valueRef.current, scope)
      }, debounceMs)
    } else {
      client.write(record, next, scope)
    }
  }, [client, debounceMs, record, scope])

  const clear = useCallback(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current)
    writeTimer.current = null
    client.clear(record, scope)
    const next = record.defaultValue()
    valueRef.current = next
    setValue(next)
  }, [client, record, scope])

  return [value, update, clear] as const
}
