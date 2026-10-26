import { useState, type ComponentProps } from 'react'
import { Check } from 'lucide-react'
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
  cn,
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
  /** The action word on the clearing rows. */
  clear: string
  /** The action word on the preferences row. */
  reset: string
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
  clearAll: 'Clear all data on this device',
  clear: 'Clear',
  reset: 'Reset',
  confirmTitle: 'Clear all data on this device?',
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
    clearAll: '清除此设备上的全部数据',
    clear: '清除',
    reset: '重置',
    confirmTitle: '清除此设备上的全部数据？',
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
    clearAll: '清除此裝置上的全部資料',
    clear: '清除',
    reset: '重設',
    confirmTitle: '清除此裝置上的全部資料？',
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
    <div className="flex flex-col gap-1" data-testid="local-data-controls">
      <DataRow label={strings.clearRecent} action={strings.clear} testId="local-data-clear-recent" onClick={() => run(strings.clearRecent, () => memory.clearStateClass('recent_activity'))} />
      <DataRow label={strings.clearDrafts} action={strings.clear} testId="local-data-clear-drafts" onClick={() => run(strings.clearDrafts, () => memory.clearStateClass('task_draft'))} />
      <DataRow label={strings.resetPreferences} action={strings.reset} testId="local-data-reset-preferences" onClick={() => run(strings.resetPreferences, () => {
        memory.clearStateClass('user_preference')
        clearArkiveThemePreference()
      })} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <DataRow label={strings.clearAll} action={strings.clear} testId="local-data-clear-all" danger />
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
          nothing change anywhere in the dialog. Collapsed while empty so the
          closed list carries no blank line. */}
      <span
        className="flex items-center gap-1 px-3 text-xs text-muted-foreground empty:hidden [&_svg]:size-3.5"
        role="status"
        aria-live="polite"
      >
        {status ? <><Check aria-hidden="true" />{status}</> : null}
      </span>
    </div>
  )
}

/**
 * One row: what it clears on the left, the action word on the right.
 *
 * A whole-row button rather than a label beside a small one, so the target is
 * the full width on a phone. Forwards props so it can be an AlertDialog trigger.
 */
function DataRow({
  label,
  action,
  testId,
  danger = false,
  ...props
}: ComponentProps<'button'> & {
  label: string
  action: string
  testId: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      // The label already says what happens; the action word only repeats it.
      aria-label={label}
      className={cn(
        'arkive-local-data-row flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors outline-none hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring',
        danger ? 'text-destructive' : 'text-foreground/85',
      )}
      {...props}
    >
      <span className="min-w-0 flex-1">{label}</span>
      <span className={cn('shrink-0 text-xs', danger ? 'font-medium' : 'text-muted-foreground')}>{action}</span>
    </button>
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
