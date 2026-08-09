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
        className="group flex aspect-square min-w-0 flex-col items-center overflow-hidden rounded-md border border-border bg-card text-center shadow-sm transition hover:border-primary/60 hover:bg-accent sm:p-3"
        data-testid="pal-card"
      >
        {pid ? (
          <span className="w-full truncate bg-muted px-1.5 py-0.5 text-left text-xs font-medium tabular-nums text-muted-foreground sm:bg-transparent sm:px-0 sm:text-center sm:font-normal">
            {pid.text}
            {pid.accent ? <span className="text-primary">{pid.accent}</span> : null}
          </span>
        ) : null}
        <div className="flex min-h-0 flex-1 items-center justify-center p-1 sm:p-0">
          <img
            src={palIconUrl(pal.icon)}
            alt=""
            loading="lazy"
            className="size-11 shrink-0 object-contain min-[480px]:size-12 sm:size-16"
          />
        </div>
        <span className="line-clamp-2 w-full px-1 pb-1 text-xs font-medium leading-tight sm:px-0 sm:pb-0">{name}</span>
      </Link>
    </PalHover>
  )
}
