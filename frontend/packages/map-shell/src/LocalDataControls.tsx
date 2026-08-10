import { useState } from 'react'
import { Check, Eraser, FileX, History, RotateCcw } from 'lucide-react'
import { browserMemory, type MemoryClient } from '@gamemap/state-memory'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  clearArkiveThemePreference,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@gamemap/ui'

export interface LocalDataStrings {
  title: string
  description: string
  clearRecent: string
  clearDrafts: string
  resetPreferences: string
  clearAll: string
  confirmTitle: string
  confirmDescription: string
  cancel: string
  confirm: string
  cleared: string
}

const ENGLISH: LocalDataStrings = {
  title: 'Data on this device',
  description: 'Manage remembered activity, drafts, and interface choices stored by this site in this browser.',
  clearRecent: 'Clear recent activity on this device',
  clearDrafts: 'Clear drafts on this device',
  resetPreferences: 'Reset interface preferences on this device',
  clearAll: 'Clear all Arkive data on this device',
  confirmTitle: 'Clear all Arkive data on this device?',
  confirmDescription: 'This removes this site\'s remembered activity, drafts, preferences, and local progress from this browser. This cannot be undone.',
  cancel: 'Cancel',
  confirm: 'Clear data',
  cleared: 'Cleared',
}

const LOCALIZED: Record<string, LocalDataStrings> = {
  'zh-CN': {
    title: '此设备上的数据',
    description: '管理此网站保存在当前浏览器中的近期记录、草稿和界面选择。',
    clearRecent: '清除此设备上的近期记录',
    clearDrafts: '清除此设备上的草稿',
    resetPreferences: '重置此设备上的界面偏好',
    clearAll: '清除此设备上的全部 Arkive 数据',
    confirmTitle: '清除此设备上的全部 Arkive 数据？',
    confirmDescription: '这会从当前浏览器移除此网站保存的近期记录、草稿、偏好和本地进度，且无法撤销。',
    cancel: '取消',
    confirm: '清除数据',
    cleared: '已清除',
  },
  'zh-TW': {
    title: '此裝置上的資料',
    description: '管理此網站儲存在目前瀏覽器中的近期記錄、草稿和介面選擇。',
    clearRecent: '清除此裝置上的近期記錄',
    clearDrafts: '清除此裝置上的草稿',
    resetPreferences: '重設此裝置上的介面偏好',
    clearAll: '清除此裝置上的全部 Arkive 資料',
    confirmTitle: '清除此裝置上的全部 Arkive 資料？',
    confirmDescription: '這會從目前瀏覽器移除此網站儲存的近期記錄、草稿、偏好和本機進度，且無法復原。',
    cancel: '取消',
    confirm: '清除資料',
    cleared: '已清除',
  },
}

export function localDataStringsFor(language: string | null | undefined): LocalDataStrings {
  return LOCALIZED[language ?? ''] ?? ENGLISH
}

export function LocalDataControls({ strings, memory = browserMemory }: {
  strings: LocalDataStrings
  /**
   * Injected so this package keeps owning no storage of its own -- the same shape
   * as ThemeProvider's `storage` and useMapViewMemory's store. Defaults to the
   * browser singleton, so every app call site is unchanged; the point is that a
   * test can pass a client backed by fake storage instead of reaching for the
   * real Web Storage globals, which `check:shell` forbids naming anywhere in this
   * package -- comments and tests included.
   */
  memory?: MemoryClient
}) {
  const [status, setStatus] = useState<string | null>(null)
  const run = (label: string, clear: () => void) => {
    clear()
    setStatus(`${label}: ${strings.cleared}`)
  }

  return (
    <div className="flex flex-col gap-2" data-testid="local-data-controls">
      <p>{strings.description}</p>
      <Button type="button" variant="outline" className="h-auto justify-start whitespace-normal text-left" onClick={() => run(strings.clearRecent, () => memory.clearStateClass('recent_activity'))}>
        <History className="size-4 shrink-0" aria-hidden="true" />
        {strings.clearRecent}
      </Button>
      <Button type="button" variant="outline" className="h-auto justify-start whitespace-normal text-left" onClick={() => run(strings.clearDrafts, () => memory.clearStateClass('task_draft'))}>
        <FileX className="size-4 shrink-0" aria-hidden="true" />
        {strings.clearDrafts}
      </Button>
      <Button type="button" variant="outline" className="h-auto justify-start whitespace-normal text-left" onClick={() => run(strings.resetPreferences, () => {
        memory.clearStateClass('user_preference')
        clearArkiveThemePreference()
      })}>
        <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
        {strings.resetPreferences}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="destructive" className="h-auto justify-start whitespace-normal text-left">
            <Eraser className="size-4 shrink-0" aria-hidden="true" />
            {strings.clearAll}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{strings.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{strings.confirmDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{strings.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(strings.clearAll, () => {
              memory.clearAll()
              clearArkiveThemePreference()
            })}>
              {strings.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Visible, not sr-only: this is the only feedback that a destructive action
          happened, so a sighted user otherwise clicks "Clear drafts" and sees
          nothing change anywhere in the dialog. */}
      <span
        className="min-h-5 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {status ? <><Check aria-hidden="true" />{status}</> : null}
      </span>
    </div>
  )
}

export function LocalDataDialog({
  strings,
  triggerLabel = strings.title,
}: {
  strings: LocalDataStrings
  triggerLabel?: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* py-2 rather than p-0: this opens the irreversible "clear everything"
            dialog, and at h-auto it was a ~21px target, under the 24px WCAG 2.2
            (2.5.8, AA) minimum. */}
        <Button type="button" variant="link" className="h-auto min-h-6 px-0 py-2 text-current">
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(85dvh,42rem)] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle>{strings.title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          <LocalDataControls strings={strings} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">{strings.cancel}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
