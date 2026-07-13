import { Link } from '@tanstack/react-router'
import { palIconUrl } from '../../../lib/assets'
import { formatPalId } from '../../../lib/palId'
import type { PalEntry } from '../../../lib/pals'
import { PalHover } from '../../catalog/components'

/** A roster tile for the `/pals` grid: icon, Paldeck id, name. Links to detail. */
export function PalCard({ pal, name }: { pal: PalEntry; name: string }) {
  const pid = formatPalId(pal.zukanIndex, pal.zukanIndexSuffix)
  return (
    <PalHover id={pal.id}>
      <Link
        to="/pals/$id"
        params={{ id: pal.id }}
        className="group flex aspect-square flex-col items-center gap-1 rounded-lg border border-border bg-card p-3 text-center shadow-sm transition hover:border-primary/60 hover:bg-accent"
        data-testid="pal-card"
      >
        <div className="flex w-full items-baseline justify-between gap-1">
          {pid ? (
            <span className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">
              {pid.text}
              {pid.accent ? <span className="text-primary">{pid.accent}</span> : null}
            </span>
          ) : (
            <span />
          )}
          {pal.size ? (
            <span className="shrink-0 text-xs text-muted-foreground">{pal.size}</span>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <img
            src={palIconUrl(pal.icon)}
            alt=""
            loading="lazy"
            className="size-16 shrink-0 object-contain"
          />
        </div>
        <span className="line-clamp-2 w-full text-xs font-medium leading-tight">{name}</span>
      </Link>
    </PalHover>
  )
}
