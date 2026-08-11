import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react"
import {
  browserMemory,
  getMemoryKey,
  type MemoryClient,
  type MemoryRecord,
  type MemoryScope,
} from "./core"
import {
  createLanguagePreference,
  languageOverrideRecord,
  languagePreferenceRecord,
} from "./language"

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

/**
 * React binding for a typed handle: `useMemory(completed.at({ map: mapId }))`.
 *
 * Prefer this over `useMemoryState(record, { partition })`. The scope travels
 * with the handle, so a caller cannot pass a scope that does not match the record
 * -- which is how four V Blood reward lists ended up sharing one key.
 */
export function useMemory<T>(
  bound: { record: MemoryRecord<T>; scope: MemoryScope },
  options: { client?: MemoryClient; debounceMs?: number } = {},
): readonly [T, (action: SetStateAction<T>) => void, () => void, MemoryWriteStatus] {
  return useMemoryState(bound.record, {
    ...bound.scope,
    client: options.client,
    debounceMs: options.debounceMs,
  })
}

/**
 * Both language layers as reactive state, plus the writes the settings panel
 * needs.
 *
 * Subscribed to the records rather than held in local state alone, so the top
 * bar and the phone sheet -- two components reading the same two records --
 * cannot drift apart after a write in either one.
 *
 * `apply` is the host's `i18n.changeLanguage`. It is called with the resolved
 * effective value rather than the value written, which is the distinction that
 * matters: setting General while this site overrides it must change what the
 * panel shows and NOT what language the page is in.
 */
export interface LanguagePreferenceControls<T extends string> {
  /** What General resolves to: the shared value, else detection without the override. */
  generalValue: T
  /** `null` when this site follows General. */
  override: T | null
  setGeneral: (code: T) => void
  setOverride: (code: T) => void
  followGeneral: () => void
}

export function useLanguagePreference<T extends string>(
  supported: readonly T[],
  fallback: T,
  apply: (code: T) => void,
  client: MemoryClient = browserMemory,
): LanguagePreferenceControls<T> {
  const preference = useMemo(
    () => createLanguagePreference(supported, fallback, { memory: client }),
    [client, fallback, supported],
  )
  const [layers, setLayers] = useState(() => preference.read())

  useEffect(() => {
    const refresh = () => setLayers(preference.read())
    refresh()
    const unsubscribes = [
      client.subscribe(languagePreferenceRecord, {}, refresh),
      client.subscribe(languageOverrideRecord, {}, refresh),
    ]
    return () => unsubscribes.forEach((off) => off())
  }, [client, preference])

  const commit = useCallback(
    (write: () => void) => {
      write()
      const next = preference.read()
      setLayers(next)
      apply(next.effective)
    },
    [apply, preference],
  )

  return {
    generalValue: layers.global ?? layers.effective,
    override: layers.override,
    setGeneral: (code) => commit(() => preference.setGlobal(code)),
    setOverride: (code) => commit(() => preference.setOverride(code)),
    followGeneral: () => commit(() => preference.clearOverride()),
  }
}
