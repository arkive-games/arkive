import { useCallback, useEffect, useId, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { Button, cn } from "@gamemap/ui"

export interface SiteInfoSection {
  /** Optional heading rendered above the body. */
  title?: string
  /** Already-rendered body — markdown in aion2, plain elements in palworld. */
  body: ReactNode
}

export interface SiteInfoFeedbackGroup {
  /** Channel label, e.g. "QQ group". */
  label: string
  /** Group number, shown verbatim and copied to the clipboard. */
  number: string
  copyLabel: string
  copiedLabel: string
}

export interface SiteInfoPanelProps {
  sections: SiteInfoSection[]
  /** Omit to hide the card entirely — locales with no contact channel. */
  feedbackGroup?: SiteInfoFeedbackGroup
  className?: string
}

const COPIED_LABEL_MS = 2000

/**
 * Site information and feedback content, rendered identically in a right
 * sidebar, a top-bar popover and a mobile sheet. Every string arrives as a
 * prop, so this package needs no translation layer; bodies arrive rendered,
 * so it needs no markdown dependency either.
 *
 * Headings are plain divs, matching the surrounding apps' chrome, so adding
 * this panel cannot disturb heading-role assertions in existing tests.
 */
export function SiteInfoPanel({ sections, feedbackGroup, className }: SiteInfoPanelProps) {
  // No SSR in these Vite SPAs, so feature-detect once up front instead of in
  // an effect — deferring it would just cost a pop-in on second paint. The
  // number itself stays visible and readable regardless of this check; only
  // the button is gated on it.
  const [canCopy] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function",
  )

  // A counter, not a boolean: each successful copy bumps it, so a second
  // click while "Copied" is still showing produces a distinct value and
  // restarts the effect's timeout instead of being swallowed as a no-op.
  const [copyCount, setCopyCount] = useState(0)
  const copied = copyCount > 0
  useEffect(() => {
    if (!copyCount) return
    const id = setTimeout(() => setCopyCount(0), COPIED_LABEL_MS)
    return () => clearTimeout(id)
  }, [copyCount])

  const ids = useId()
  const number = feedbackGroup?.number
  const copy = useCallback(async () => {
    if (!number) return
    try {
      await navigator.clipboard.writeText(number)
      setCopyCount((n) => n + 1)
    } catch (err) {
      // Clipboard blocked by permissions — leave the label alone so the UI
      // does not claim a copy that never happened, but still log for
      // debugging (matches GameMapView's clipboard error handling).
      console.error("Clipboard error", err)
    }
  }, [number])

  return (
    <div data-testid="site-info-panel" className={cn("flex flex-col gap-4 font-sans text-sm", className)}>
      {sections.map((section, i) => (
        <div key={i} className="flex flex-col gap-1">
          {section.title && (
            // text-lg over text-sm body: at text-sm it was the same size as the
            // prose beneath it, so the section had no visible heading at all.
            <div className="text-lg font-semibold text-foreground">{section.title}</div>
          )}
          {/* text-sm, not the text-xs floor: this is prose meant to be read, in
              a 320px column. Hosts that wrap their body in Tailwind Typography
              must point --tw-prose-body at the muted token so both sites match
              on colour as well as size. */}
          <div className="text-sm leading-relaxed break-words text-muted-foreground [&_a]:text-primary [&_a]:underline">
            {section.body}
          </div>
        </div>
      ))}

      {feedbackGroup && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="min-w-0">
            <div id={`${ids}-label`} className="text-xs text-muted-foreground">
              {feedbackGroup.label}
            </div>
            <div
              id={`${ids}-number`}
              data-testid="site-info-group-number"
              className="break-all font-mono text-sm text-foreground select-all"
            >
              {feedbackGroup.number}
            </div>
          </div>
          {canCopy && (
            <Button
              id={`${ids}-copy`}
              type="button"
              size="sm"
              variant="secondary"
              data-testid="site-info-copy"
              aria-labelledby={`${ids}-copy ${ids}-label ${ids}-number`}
              onClick={() => void copy()}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? feedbackGroup.copiedLabel : feedbackGroup.copyLabel}
            </Button>
          )}
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? feedbackGroup.copiedLabel : ""}
          </span>
        </div>
      )}
    </div>
  )
}
