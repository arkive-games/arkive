import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from 'react'
import { useOptionalAuth } from '@gamemap/auth'
import { useMemory } from '@gamemap/state-memory'

import {
  characterApi,
  isConflict,
  isInactive,
  isNotFound,
  isUnauthorized,
  type CharacterApi,
  type CharacterMeta,
  type CharacterSummary,
  type SavedCharacter,
} from '@/features/characters/api'
import { AutoSaver } from '@/features/characters/autosave'
import {
  envelopeOf,
  LOCAL_RECORDS,
  readSection,
  readSections,
  upgrade,
  withSection,
  type Envelope,
  type SectionKey,
  type Sections,
} from '@/features/characters/envelope'
import { lastCharacter, workingCopyOf, type WorkingCopy } from '@/features/characters/memory'

/**
 * Where the score page's inputs come from, and where its edits go.
 *
 * - **Local draft** (`id` null): the page as it always was — five local
 *   drafts, nothing sent anywhere.
 * - **A saved character, owned**: a local working copy of the character, kept
 *   per character and never expiring, plus an upload to the server after
 *   edits settle (see `AutoSaver`). Every edit lands in the working copy
 *   first, so an upload that fails, a sign-out or a closed tab loses nothing:
 *   the copy is sent the next time the character is opened.
 * - **A saved character, someone else's** (or one this page is too old to
 *   write): read-only, straight from the server.
 *
 * The local draft is never written by a saved character, nor a saved
 * character by the local draft; the two only meet when the player saves the
 * draft as a new character, which copies it.
 */

export type SyncStatus =
  /** No saved character is open. */
  | 'local'
  | 'loading'
  | 'saved'
  | 'pending'
  | 'saving'
  /** The last upload failed for want of a network; it is retried. */
  | 'offline'
  /** The server's copy moved on since this one was read; the player chooses. */
  | 'conflict'
  /** Edits are kept here, waiting for the owner to sign in again. */
  | 'signed-out'
  /** Someone else's character. */
  | 'readonly'
  /** Saved by a newer page than this one; read-only until reloaded. */
  | 'newer'
  | 'missing'
  | 'error'

export type CharacterContextValue = {
  /** The open saved character's public id, or null for the local draft. */
  id: string | null
  sections: Sections
  setSection: <K extends SectionKey>(key: K, action: SetStateAction<Sections[K]>) => void
  readOnly: boolean
  status: SyncStatus
  /** The open saved character's metadata, as the server last returned it. */
  character: SavedCharacter | null
  /** The signed-in player's own characters; null when signed out or not loaded yet. */
  characters: CharacterSummary[] | null
  /** The server's copy when it conflicts with this one. */
  conflict: SavedCharacter | null
  /** True when an unsent edit of the open character is held on this device. */
  hasUnsent: boolean
  signedIn: boolean
  api: CharacterApi | null
  keepMine(): void
  takeServer(): void
  updateMeta(meta: CharacterMeta): Promise<void>
  /** Saves the local draft as a new character and returns its id. */
  saveDraftAs(name: string): Promise<string>
  copy(id: string, name?: string): Promise<string>
  remove(id: string): Promise<void>
  reorder(ids: string[]): Promise<void>
  refreshList(): Promise<void>
}

const CharacterContext = createContext<CharacterContextValue | null>(null)

const NO_CHARACTER = '-'
const RETRY_MS = 30_000

function resolve<T>(action: SetStateAction<T>, previous: T): T {
  return typeof action === 'function' ? (action as (prev: T) => T)(previous) : action
}

export function CharacterProvider({ id, children }: { id: string | null; children: ReactNode }) {
  const auth = useOptionalAuth()
  const userId = auth?.user?.id ?? null
  const api = characterApi()

  // The local draft, always bound so the hook order never depends on the mode.
  const [localCharacter, setLocalCharacter] = useMemory(LOCAL_RECORDS.character)
  const [localTalents, setLocalTalents] = useMemory(LOCAL_RECORDS.talents)
  const [localBonds, setLocalBonds] = useMemory(LOCAL_RECORDS.bonds)
  const [localEquipment, setLocalEquipment] = useMemory(LOCAL_RECORDS.equipment)
  const [localRelics, setLocalRelics] = useMemory(LOCAL_RECORDS.relics)

  const bound = useMemo(() => workingCopyOf(id ?? NO_CHARACTER), [id])
  const [copy] = useMemory(bound)
  const [, setLast] = useMemory(lastCharacter)

  const [server, setServer] = useState<SavedCharacter | null>(null)
  const [newer, setNewer] = useState(false)
  const [status, setStatus] = useState<SyncStatus>(id ? 'loading' : 'local')
  const [conflict, setConflict] = useState<SavedCharacter | null>(null)
  const [characters, setCharacters] = useState<CharacterSummary[] | null>(null)

  // Read by the upload, which runs outside render and must see the present.
  const blocked = useRef(true)
  const saverRef = useRef<AutoSaver | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const editable = Boolean(id && server?.editable && !newer)

  /* ------------------------------------------------------------- the list */

  const refreshList = useCallback(async () => {
    if (!api || !userId) {
      setCharacters(null)
      return
    }
    try {
      setCharacters(await api.list())
    } catch (error) {
      if (isUnauthorized(error)) setCharacters(null)
      else console.error(error)
    }
  }, [api, userId])

  useEffect(() => {
    void refreshList()
  }, [refreshList])

  /* --------------------------------------------------------------- upload */

  const send = useCallback(async (target: string, at: typeof bound) => {
    if (!api || blocked.current) return
    const working = at.read()
    if (!working || !working.dirty) return
    const sent = JSON.stringify(working.data)
    setStatus('saving')
    try {
      const saved = await api.update(target, { revision: working.revision, data: working.data })
      const now = at.read()
      // An edit made while this was in flight is still unsent.
      const stillDirty = Boolean(now && JSON.stringify(now.data) !== sent)
      at.write({ data: now?.data ?? saved.data, revision: saved.revision, dirty: stillDirty })
      setServer(saved)
      setStatus(stillDirty ? 'pending' : 'saved')
    } catch (error) {
      if (isConflict(error)) {
        blocked.current = true
        try {
          const latest = await api.get(target)
          setServer(latest)
          setConflict(latest)
        } catch (cause) {
          console.error(cause)
        }
        setStatus('conflict')
        return
      }
      if (isUnauthorized(error) || isInactive(error) || isNotFound(error)) {
        // Signed out, disabled, or no longer this account's: keep the copy, stop
        // sending. Retrying any of these would only fail the same way forever.
        blocked.current = true
        setStatus(isNotFound(error) ? 'missing' : 'signed-out')
        return
      }
      setStatus('offline')
      if (retryTimer.current) clearTimeout(retryTimer.current)
      retryTimer.current = setTimeout(() => saverRef.current?.touch(), RETRY_MS)
      throw error
    }
  }, [api])

  useEffect(() => {
    if (!id || !api) return
    const at = workingCopyOf(id)
    const saver = new AutoSaver(() => send(id, at))
    saverRef.current = saver
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void saver.flush()
    }
    const onPageHide = () => void saver.flush()
    const onOnline = () => {
      if (at.read()?.dirty) saver.touch()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('online', onOnline)
      if (retryTimer.current) clearTimeout(retryTimer.current)
      saverRef.current = null
      void saver.flush().finally(() => saver.dispose())
    }
  }, [id, api, send])

  /* ----------------------------------------------------------------- load */

  useEffect(() => {
    if (!id) return
    if (!api) {
      setStatus('error')
      return
    }
    let live = true
    blocked.current = true
    setStatus('loading')
    api.get(id).then((loaded) => {
      if (!live) return
      const { envelope, newer: tooNew } = upgrade(loaded.data)
      setServer(loaded)
      setNewer(tooNew)
      setConflict(null)
      const working = bound.read()
      if (!loaded.editable) {
        // A copy held for this id is kept: it may be this player's from another
        // session, waiting for them to sign back in.
        setStatus(working?.dirty ? 'signed-out' : 'readonly')
        return
      }
      if (tooNew) {
        setStatus('newer')
        return
      }
      setLast(loaded.id)
      if (working?.dirty) {
        if (working.revision === loaded.revision) {
          blocked.current = false
          setStatus('pending')
          saverRef.current?.touch()
        } else {
          setConflict(loaded)
          setStatus('conflict')
        }
        return
      }
      bound.write({ data: envelope, revision: loaded.revision, dirty: false })
      blocked.current = false
      setStatus('saved')
    }).catch((error) => {
      if (!live) return
      if (isNotFound(error)) setStatus('missing')
      else {
        console.error(error)
        setStatus('error')
      }
    })
    return () => {
      live = false
    }
  }, [id, api, bound, userId, setLast])

  /* --------------------------------------------------------------- values */

  const sections = useMemo<Sections>(() => {
    if (!id) {
      return {
        character: readSection('character', localCharacter),
        talents: readSection('talents', localTalents),
        bonds: readSection('bonds', localBonds),
        equipment: readSection('equipment', localEquipment),
        relics: readSection('relics', localRelics),
      }
    }
    if (editable && copy) return readSections(copy.data)
    return readSections(server ? upgrade(server.data).envelope : { schemaVersion: 1 })
  }, [id, editable, copy, server, localCharacter, localTalents, localBonds, localEquipment, localRelics])

  const readOnly = Boolean(id) && (!editable || status === 'conflict' || status === 'loading' || !copy)

  const setSection = useCallback(<K extends SectionKey>(key: K, action: SetStateAction<Sections[K]>) => {
    if (!id) {
      const setters: { [S in SectionKey]: (update: (prev: Sections[S]) => Sections[S]) => void } = {
        character: setLocalCharacter,
        talents: setLocalTalents,
        bonds: setLocalBonds,
        equipment: setLocalEquipment,
        relics: setLocalRelics,
      }
      ;(setters[key] as (update: (prev: Sections[K]) => Sections[K]) => void)(
        (prev) => resolve(action, readSection(key, prev)),
      )
      return
    }
    if (readOnly) return
    const working = bound.read()
    if (!working) return
    const next = resolve(action, readSection(key, working.data[key]))
    bound.write({ data: withSection(working.data, key, next), revision: working.revision, dirty: true })
    setStatus((prev) => (prev === 'saving' ? prev : 'pending'))
    saverRef.current?.touch()
  }, [id, readOnly, bound, setLocalCharacter, setLocalTalents, setLocalBonds, setLocalEquipment, setLocalRelics])

  /* -------------------------------------------------------------- actions */

  const keepMine = useCallback(() => {
    const working = bound.read()
    if (!conflict || !working) return
    bound.write({ ...working, revision: conflict.revision, dirty: true })
    setConflict(null)
    blocked.current = false
    setStatus('pending')
    // The refused upload left nothing pending in the scheduler, so mark the copy
    // as an edit to send before flushing; a bare flush would send nothing.
    saverRef.current?.touch()
    void saverRef.current?.flush()
  }, [bound, conflict])

  const takeServer = useCallback(() => {
    if (!conflict) return
    bound.write({ data: upgrade(conflict.data).envelope, revision: conflict.revision, dirty: false })
    setConflict(null)
    blocked.current = false
    setStatus('saved')
  }, [bound, conflict])

  const updateMeta = useCallback(async (meta: CharacterMeta) => {
    if (!api || !id || !server) return
    // Data first, so the metadata write carries the revision that upload produced.
    await saverRef.current?.flush()
    const working = bound.read()
    try {
      const saved = await api.update(id, { ...meta, revision: working?.revision ?? server.revision })
      const now = bound.read()
      if (now) bound.write({ ...now, revision: saved.revision })
      setServer(saved)
      void refreshList()
    } catch (error) {
      if (isConflict(error)) {
        blocked.current = true
        const latest = await api.get(id)
        setServer(latest)
        setConflict(latest)
        setStatus('conflict')
      }
      throw error
    }
  }, [api, id, server, bound, refreshList])

  const saveDraftAs = useCallback(async (name: string) => {
    if (!api) throw new Error('no API configured')
    const local: Sections = {
      character: readSection('character', localCharacter),
      talents: readSection('talents', localTalents),
      bonds: readSection('bonds', localBonds),
      equipment: readSection('equipment', localEquipment),
      relics: readSection('relics', localRelics),
    }
    const created = await api.create({ name, data: envelopeOf(local) })
    void refreshList()
    return created.id
  }, [api, localCharacter, localTalents, localBonds, localEquipment, localRelics, refreshList])

  const copyCharacter = useCallback(async (source: string, name?: string) => {
    if (!api) throw new Error('no API configured')
    if (source === id) await saverRef.current?.flush()
    const created = await api.copy(source, name)
    void refreshList()
    return created.id
  }, [api, id, refreshList])

  const remove = useCallback(async (target: string) => {
    if (!api) return
    await api.remove(target)
    workingCopyOf(target).clear()
    void refreshList()
  }, [api, refreshList])

  const reorder = useCallback(async (ids: string[]) => {
    if (!api) return
    setCharacters((prev) => (prev ? ids.map((each) => prev.find((c) => c.id === each)).filter((c): c is CharacterSummary => Boolean(c)) : prev))
    try {
      await api.reorder(ids)
    } finally {
      void refreshList()
    }
  }, [api, refreshList])

  const value = useMemo<CharacterContextValue>(() => ({
    id,
    sections,
    setSection,
    readOnly,
    status,
    character: server,
    characters,
    conflict,
    hasUnsent: Boolean(copy?.dirty),
    signedIn: Boolean(userId),
    api,
    keepMine,
    takeServer,
    updateMeta,
    saveDraftAs,
    copy: copyCharacter,
    remove,
    reorder,
    refreshList,
  }), [id, sections, setSection, readOnly, status, server, characters, conflict, copy, userId, api, keepMine, takeServer, updateMeta, saveDraftAs, copyCharacter, remove, reorder, refreshList])

  return <CharacterContext.Provider value={value}>{children}</CharacterContext.Provider>
}

export function useCharacter(): CharacterContextValue {
  const context = useContext(CharacterContext)
  if (!context) throw new Error('useCharacter must be used inside a <CharacterProvider>')
  return context
}

/**
 * One section of the open character, read and written like `useMemory`.
 *
 * Outside a provider it falls back to nothing being editable: every section
 * the score page renders is always inside one.
 */
export function useSection<K extends SectionKey>(key: K): readonly [Sections[K], (action: SetStateAction<Sections[K]>) => void] {
  const { sections, setSection } = useCharacter()
  const set = useCallback((action: SetStateAction<Sections[K]>) => setSection(key, action), [key, setSection])
  return [sections[key], set] as const
}

/** Whether the open character is read-only, false outside a provider. */
export function useCharacterReadOnly(): boolean {
  return useContext(CharacterContext)?.readOnly ?? false
}

export type { Envelope, WorkingCopy }
