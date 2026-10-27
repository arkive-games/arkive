import type { ReactNode } from "react"
import {
  Button,
  Dialog,
  DialogContent,
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
 * max-height body, and the round close button in the corner.
 *
 * The trigger carries `site-info-open` and the close button `site-info-close`,
 * the hooks the e2e suites and every app's settings sheet already look for.
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
        closeButtonProps={{
          "aria-label": labels.close,
          title: labels.close,
          "data-testid": "site-info-close",
        }}
        className="max-h-[min(80dvh,44rem)] grid-rows-[auto_minmax(0,1fr)]"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{labels.title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto pr-1">{children}</div>
      </DialogContent>
    </Dialog>
  )
}
