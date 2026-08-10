import { useCallback, useEffect, useState, type ReactNode } from "react"
import { IconAlertCircle, IconCheck, IconCopy, IconMapPin } from "@tabler/icons-react"
import { Card, CardContent, cn } from "@gamemap/ui"
import { IdLabel, type IdLabelValue } from "./IdLabel"

export type MarkerPopupPositionCopy = {
  /** The exact coordinate text shown in the popup and written to the clipboard. */
  value: string
  copyLabel: string
  copiedLabel: string
  failedLabel: string
}

export type MarkerPopupCardProps = {
  idLabel?: IdLabelValue
  name: string
  icon?: ReactNode
  metaLine?: ReactNode
  positionLabel?: ReactNode
  positionValue?: ReactNode
  positionCopy?: MarkerPopupPositionCopy
  description?: string
  images?: string[]
  children?: ReactNode
  className?: string
}

export function MarkerPopupCard({
  idLabel, name, icon, metaLine, positionLabel, positionValue,
  positionCopy, description, images, children, className,
}: MarkerPopupCardProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle")

  useEffect(() => {
    setCopyState("idle")
  }, [positionCopy?.value])

  useEffect(() => {
    if (copyState === "idle") return
    const id = setTimeout(() => setCopyState("idle"), 2000)
    return () => clearTimeout(id)
  }, [copyState])

  const copyPosition = useCallback(async () => {
    if (!positionCopy) return
    try {
      if (typeof navigator === "undefined" || typeof navigator.clipboard?.writeText !== "function") {
        throw new Error("Clipboard API unavailable")
      }
      await navigator.clipboard.writeText(positionCopy.value)
      setCopyState("copied")
    } catch (err) {
      setCopyState("failed")
      console.error("Clipboard error", err)
    }
  }, [positionCopy])

  const copyStatusLabel = positionCopy
    ? copyState === "copied"
      ? positionCopy.copiedLabel
      : copyState === "failed"
        ? positionCopy.failedLabel
        : positionCopy.copyLabel
    : ""

  return (
    <Card
      data-testid="marker-popup-card"
      className={cn(
        "gm-popup-card max-h-[min(72dvh,32rem)] w-[min(20rem,calc(100vw-2rem))] gap-0 overflow-y-auto rounded-lg border-0 bg-card py-0 text-card-foreground shadow-[0_18px_50px_rgba(10,50,48,0.22)] overscroll-contain",
        className,
      )}
    >
      <div className="h-1 bg-[color:var(--arkive-nav-accent,var(--ring))]" aria-hidden="true" />
      <CardContent className="flex flex-col px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-border">
            {icon ?? <IconMapPin className="size-5" stroke={1.8} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              {/* font-bold, not the subsection_title role's 600: the map UI spec
                  overrides the weight for this one heading (title_weight: 700). */}
              <h2 className="min-w-0 truncate text-base font-bold leading-normal text-foreground">
                {name}
              </h2>
              {idLabel && <IdLabel value={idLabel} className="shrink-0 px-1.5 py-0.5 text-xs" />}
            </div>
            {metaLine ? (
              <div className="mt-1 truncate text-xs font-medium text-muted-foreground">
                {metaLine}
              </div>
            ) : null}
          </div>
        </div>

        {positionValue ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <IconMapPin className="size-4 text-[color:var(--arkive-nav-accent,var(--ring))]" stroke={1.8} />
              {positionLabel}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {positionValue}
              </span>
              {positionCopy ? (
                <button
                  type="button"
                  data-testid="marker-position-copy"
                  aria-label={copyStatusLabel}
                  title={copyStatusLabel}
                  onClick={(event) => {
                    event.stopPropagation()
                    void copyPosition()
                  }}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 font-sans text-xs font-semibold transition-colors",
                    copyState === "copied" && "bg-primary/10 text-primary",
                    copyState === "failed" && "bg-destructive/10 text-destructive",
                    copyState === "idle" && "text-muted-foreground hover:bg-primary/10 hover:text-primary",
                  )}
                >
                  {copyState === "copied" ? (
                    <IconCheck className="size-4" stroke={1.8} />
                  ) : copyState === "failed" ? (
                    <IconAlertCircle className="size-4" stroke={1.8} />
                  ) : (
                    <IconCopy className="size-4" stroke={1.8} />
                  )}
                  {copyState !== "idle" ? <span>{copyStatusLabel}</span> : null}
                </button>
              ) : null}
            </span>
            {positionCopy ? (
              <span role="status" aria-live="polite" className="sr-only">
                {copyState === "idle" ? "" : copyStatusLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {description?.trim() ? (
          <div
            data-testid="marker-description"
            className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/85"
          >
            {description}
          </div>
        ) : null}
        {images?.length ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {images.map((src, i) => (
              <img key={`${src}-${i}`} src={src} alt="" loading="lazy"
                className="aspect-[4/3] w-full rounded-lg object-cover ring-1 ring-border" />
            ))}
          </div>
        ) : null}
        {children}
      </CardContent>
    </Card>
  )
}
