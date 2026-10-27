import { useState, type ComponentProps, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { IconTrash } from '@tabler/icons-react'
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
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@gamemap/ui'

export interface LocalDataStrings {
  title: string
  description: string
  /** Each row's name; the confirm dialog lists the same words as what it removes. */
  recent: string
  drafts: string
  preferences: string
  /** Named only in the confirm dialog: no row clears progress alone. */
  progress: string
  everything: string
  /** The rows' accessible names, which say what the short action word does. */
  clearRecent: string
  clearDrafts: string
  resetPreferences: string
  clearAll: string
  /** The action word on the clearing rows. */
  clear: string
  /** The action word on the preferences row. */
  reset: string
  /** The action word on the clear-everything row. */
  clearEverything: string
  confirmTitle: string
  /** Introduces the list of what goes. */
  confirmDescription: string
  confirmWarning: string
  cancel: string
  confirm: string
  cleared: string
}

const ENGLISH: LocalDataStrings = {
  title: 'Data on this device',
  description: 'Manage remembered activity, drafts, and interface choices stored by this site in this browser.',
  recent: 'Recent activity',
  drafts: 'Drafts',
  preferences: 'Interface preferences',
  progress: 'Local progress',
  everything: 'All data on this device',
  clearRecent: 'Clear recent activity on this device',
  clearDrafts: 'Clear drafts on this device',
  resetPreferences: 'Reset interface preferences on this device',
  clearAll: 'Clear all data on this device',
  clear: 'Clear',
  reset: 'Reset',
  clearEverything: 'Clear all',
  confirmTitle: 'Clear all data on this device?',
  confirmDescription: 'These will be removed from this browser:',
  confirmWarning: 'This cannot be undone',
  cancel: 'Keep it',
  confirm: 'Clear data',
  cleared: 'Cleared',
}

const LOCALIZED: Record<string, LocalDataStrings> = {
  'zh-CN': {
    title: '此设备上的数据',
    description: '管理此网站保存在当前浏览器中的近期记录、草稿和界面选择。',
    recent: '近期记录',
    drafts: '草稿',
    preferences: '界面偏好',
    progress: '本地进度',
    everything: '此设备上的全部数据',
    clearRecent: '清除此设备上的近期记录',
    clearDrafts: '清除此设备上的草稿',
    resetPreferences: '重置此设备上的界面偏好',
    clearAll: '清除此设备上的全部数据',
    clear: '清除',
    reset: '重置',
    clearEverything: '全部清除',
    confirmTitle: '清除此设备上的全部数据？',
    confirmDescription: '下面这些会从当前浏览器里移除：',
    confirmWarning: '清除后无法撤销',
    cancel: '再想想',
    confirm: '清除数据',
    cleared: '已清除',
  },
  'zh-TW': {
    title: '此裝置上的資料',
    description: '管理此網站儲存在目前瀏覽器中的近期記錄、草稿和介面選擇。',
    recent: '近期記錄',
    drafts: '草稿',
    preferences: '介面偏好',
    progress: '本機進度',
    everything: '此裝置上的全部資料',
    clearRecent: '清除此裝置上的近期記錄',
    clearDrafts: '清除此裝置上的草稿',
    resetPreferences: '重設此裝置上的介面偏好',
    clearAll: '清除此裝置上的全部資料',
    clear: '清除',
    reset: '重設',
    clearEverything: '全部清除',
    confirmTitle: '清除此裝置上的全部資料？',
    confirmDescription: '下面這些會從目前瀏覽器裡移除：',
    confirmWarning: '清除後無法復原',
    cancel: '再想想',
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
    <div className="arkive-local-data" data-testid="local-data-controls">
      <DataRow label={strings.recent}>
        <ActionButton label={strings.clearRecent} testId="local-data-clear-recent" onClick={() => run(strings.recent, () => memory.clearStateClass('recent_activity'))}>
          {strings.clear}
        </ActionButton>
      </DataRow>
      <DataRow label={strings.drafts}>
        <ActionButton label={strings.clearDrafts} testId="local-data-clear-drafts" onClick={() => run(strings.drafts, () => memory.clearStateClass('task_draft'))}>
          {strings.clear}
        </ActionButton>
      </DataRow>
      <DataRow label={strings.preferences}>
        <ActionButton label={strings.resetPreferences} testId="local-data-reset-preferences" onClick={() => run(strings.preferences, () => {
          memory.clearStateClass('user_preference')
          clearArkiveThemePreference()
        })}>
          {strings.reset}
        </ActionButton>
      </DataRow>
      <DataRow label={strings.everything} danger>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <ActionButton label={strings.clearAll} testId="local-data-clear-all">{strings.clearEverything}</ActionButton>
          </AlertDialogTrigger>
          <AlertDialogContent className="arkive-clear-confirm sm:max-w-[26rem]">
            <span className="arkive-clear-badge" aria-hidden="true">
              <IconTrash className="size-7" stroke={2} />
            </span>
            <AlertDialogHeader className="place-items-center text-center">
              <AlertDialogTitle className="arkive-dialog-title">{strings.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{strings.confirmDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="arkive-clear-chips">
              {[strings.recent, strings.drafts, strings.preferences, strings.progress].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="arkive-clear-warning">{strings.confirmWarning}</p>
            <AlertDialogFooter className="grid grid-cols-2 gap-2.5 sm:grid-cols-2">
              <AlertDialogCancel className="h-11">{strings.cancel}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" className="arkive-clear-action h-11" onClick={() => run(strings.everything, () => {
                memory.clearAll()
                clearArkiveThemePreference()
              })}>
                {strings.confirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DataRow>
      {/* Visible, not sr-only: this is the only feedback that a destructive action
          happened, so a sighted user otherwise clicks "Clear drafts" and sees
          nothing change anywhere in the dialog. Collapsed while empty so the
          closed list carries no blank line. */}
      <span
        className="flex items-center gap-1 px-2 pt-1 text-xs text-muted-foreground empty:hidden [&_svg]:size-3.5"
        role="status"
        aria-live="polite"
      >
        {status ? <><Check aria-hidden="true" />{status}</> : null}
      </span>
    </div>
  )
}

/** One row: what it holds on the left, a small pill acting on it on the right. */
function DataRow({ label, danger = false, children }: { label: string; danger?: boolean; children: ReactNode }) {
  return (
    <div className="arkive-local-data-row" data-danger={danger || undefined}>
      <span className="min-w-0 flex-1">{label}</span>
      {children}
    </div>
  )
}

/**
 * The pill. Its visible word is short ("Clear"), so its accessible name is the
 * full sentence -- out of context a screen reader would otherwise hear four
 * buttons saying "Clear". Forwards props so it can be an AlertDialog trigger.
 */
function ActionButton({ label, testId, children, ...props }: ComponentProps<'button'> & {
  label: string
  testId: string
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      className="arkive-local-data-action outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...props}
    >
      {children}
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
      <DialogContent className="max-h-[min(85dvh,42rem)] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle className="arkive-dialog-title">{strings.title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">
          <LocalDataControls strings={strings} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
