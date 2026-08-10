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

export type MemoryWriteStatus = "idle" | "saved" | "failed"

export function useMemoryState<T>(
  record: MemoryRecord<T>,
  options: UseMemoryStateOptions = {},
): readonly [T, (action: SetStateAction<T>) => void, () => void, MemoryWriteStatus] {
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
  const [writeStatus, setWriteStatus] = useState<MemoryWriteStatus>("idle")
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

  useEffect(() => {
    const flush = (reportStatus = true) => {
      if (!writeTimer.current) return
      clearTimeout(writeTimer.current)
      writeTimer.current = null
      const saved = client.write(record, valueRef.current, scope)
      if (reportStatus) setWriteStatus(saved ? "saved" : "failed")
    }
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    const handlePageHide = () => flush()
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("pagehide", handlePageHide)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("pagehide", handlePageHide)
      flush(false)
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
      setWriteStatus("idle")
      writeTimer.current = setTimeout(() => {
        writeTimer.current = null
        setWriteStatus(client.write(record, valueRef.current, scope) ? "saved" : "failed")
      }, debounceMs)
    } else {
      setWriteStatus(client.write(record, next, scope) ? "saved" : "failed")
    }
  }, [client, debounceMs, record, scope])

  const clear = useCallback(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current)
    writeTimer.current = null
    client.clear(record, scope)
    setWriteStatus("idle")
    const next = record.defaultValue()
    valueRef.current = next
    setValue(next)
  }, [client, record, scope])

  return [value, update, clear, writeStatus] as const
}
