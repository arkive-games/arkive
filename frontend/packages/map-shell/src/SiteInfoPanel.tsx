import { useCallback, useEffect, useState, type ReactNode } from "react"
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
  // Probed after mount rather than at render: on an insecure origin or an old
  // browser there is no Clipboard API, and a button that silently does nothing
  // is worse than no button. The number stays selectable either way.
  const [canCopy, setCanCopy] = useState(false)
  useEffect(() => {
    setCanCopy(typeof navigator.clipboard?.writeText === "function")
  }, [])

  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const number = feedbackGroup?.number
  const copy = useCallback(async () => {
    if (!number) return
    try {
      await navigator.clipboard.writeText(number)
      setCopied(true)
    } catch {
      // Clipboard blocked by permissions — leave the label alone so the UI
      // does not claim a copy that never happened.
    }
  }, [number])

  return (
    <div data-testid="site-info-panel" className={cn("flex flex-col gap-4", className)}>
      {sections.map((section, i) => (
        <div key={section.title ?? i} className="flex flex-col gap-1">
          {section.title && (
            <div className="text-sm font-semibold text-foreground">{section.title}</div>
          )}
          <div className="text-xs leading-relaxed break-words text-muted-foreground [&_a]:text-primary [&_a]:underline">
            {section.body}
          </div>
        </div>
      ))}

      {feedbackGroup && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{feedbackGroup.label}</div>
            <div
              data-testid="site-info-group-number"
              className="truncate font-mono text-sm text-foreground select-all"
            >
              {feedbackGroup.number}
            </div>
          </div>
          {canCopy && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="site-info-copy"
              onClick={() => void copy()}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? feedbackGroup.copiedLabel : feedbackGroup.copyLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
