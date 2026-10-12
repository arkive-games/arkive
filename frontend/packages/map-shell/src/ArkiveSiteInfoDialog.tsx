import type { ReactNode } from "react"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@gamemap/ui"

export interface ArkiveSiteInfoDialogLabels {
  /** The trigger button's text, e.g. "About". */
  trigger: string
  /** Dialog title; kept for assistive tech when the panel shows its own heading. */
  title: string
  close: string
}

/**
 * The "About / site info" dialog: a trigger button, the panel in a scrollable
 * max-height body, and a close action in the footer.
 *
 * The trigger carries `site-info-open` and the body starts with
 * `site-info-close`, the hooks the e2e suites and every app's settings sheet
 * already look for.
 */
export function ArkiveSiteInfoDialog({
  labels,
  testId = "site-info-open",
  children,
}: {
  labels: ArkiveSiteInfoDialogLabels
  testId?: string
  children: ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" data-testid={testId}>
          {labels.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(80dvh,44rem)] grid-rows-[auto_minmax(0,1fr)_auto]"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{labels.title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" data-testid="site-info-close">
              {labels.close}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
