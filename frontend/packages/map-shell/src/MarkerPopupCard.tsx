import type { ReactNode } from "react"
import { IconMapPin } from "@tabler/icons-react"
import { Card, CardContent, cn } from "@gamemap/ui"
import { IdLabel, type IdLabelValue } from "./IdLabel"

export type MarkerPopupCardProps = {
  idLabel?: IdLabelValue
  name: string
  icon?: ReactNode
  metaLine?: ReactNode
  positionLabel?: ReactNode
  positionValue?: ReactNode
  description?: string
  noDescriptionLabel?: string
  images?: string[]
  children?: ReactNode
  className?: string
}

export function MarkerPopupCard({
  idLabel, name, icon, metaLine, positionLabel, positionValue,
  description, noDescriptionLabel, images, children, className,
}: MarkerPopupCardProps) {
  return (
    <Card
      data-testid="marker-popup-card"
      className={cn(
        "gm-popup-card w-[320px] gap-0 overflow-hidden rounded-xl border-0 bg-card py-0 text-card-foreground shadow-[0_18px_50px_rgba(10,50,48,0.22)]",
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
              <h2 className="min-w-0 truncate text-base font-bold leading-snug text-foreground">
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
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {positionValue}
            </span>
          </div>
        ) : null}

        {description ? (
          <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
            {description}
          </div>
        ) : (
          <div className="mt-3 text-sm leading-relaxed text-muted-foreground/70 italic">
            {noDescriptionLabel ?? ""}
          </div>
        )}
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
