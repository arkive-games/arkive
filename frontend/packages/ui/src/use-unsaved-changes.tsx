import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogCancel } from './alert-dialog'
import { Button } from './button'

export type UnsavedChangesRequest = (leave: () => void) => void
export interface UnsavedChangesLabels {
  title: string; description: string; save: string; discard: string; stay: string; failed: string
}

/** Navigation stays app-owned; the shared control waits for confirmed saving. */
export function useUnsavedChanges({ dirty, onSave, onDiscard, labels }: {
  dirty: boolean; onSave: () => boolean | Promise<boolean>; onDiscard: () => void; labels: UnsavedChangesLabels
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const pending = useRef<(() => void) | null>(null)
  const saving = useRef(false)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const request = useCallback<UnsavedChangesRequest>(leave => {
    if (!dirty) { leave(); return }
    pending.current = leave
    setError(false)
    setOpen(true)
  }, [dirty])
  const stay = () => {
    if (saving.current) return
    pending.current = null
    setOpen(false)
    setError(false)
  }
  const finish = () => {
    const leave = pending.current
    pending.current = null
    setOpen(false)
    leave?.()
  }
  const save = async () => {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(false)
    try {
      if (await onSave()) finish()
      else setError(true)
    } catch { setError(true) }
    finally { saving.current = false; setBusy(false) }
  }
  const dialog = <AlertDialog open={open} onOpenChange={next => { if (!next) stay() }}>
    <AlertDialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault() }}>
      <AlertDialogHeader><AlertDialogTitle>{labels.title}</AlertDialogTitle><AlertDialogDescription>{labels.description}</AlertDialogDescription></AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{labels.failed}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={busy} onClick={stay}>{labels.stay}</AlertDialogCancel>
        <Button variant="outline" disabled={busy} onClick={() => { onDiscard(); finish() }}>{labels.discard}</Button>
        <Button disabled={busy} onClick={() => void save()}>{labels.save}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  return { request, dialog }
}
