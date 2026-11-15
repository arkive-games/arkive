import { Link } from '@tanstack/react-router'
import { Zap } from 'lucide-react'
import { elementIconUrl, palIconUrl } from '../../../lib/assets'
import { formatPalId } from '../../../lib/palId'
import type { PalEntry } from '../../../lib/pals'
import { PalHover } from '../../catalog/components'

/** A roster tile for the `/pals` grid: icon, Paldeck id, name. Links to detail. */
export function PalCard({
  pal,
  name,
  breedingPower,
  breedingPowerLabel,
}: {
  pal: PalEntry
  name: string
  breedingPower?: number
  breedingPowerLabel: string
}) {
  const pid = formatPalId(pal.zukanIndex, pal.zukanIndexSuffix)
  return (
    <PalHover id={pal.id}>
      <Link
        to="/pals/$id"
        params={{ id: pal.id }}
        className="group flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card text-center transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-ring"
        data-testid="pal-card"
      >
        <span className="flex w-full items-center justify-between gap-1 px-3 pt-3 text-xs font-medium tabular-nums text-muted-foreground">
          <span className="truncate">
            {pid?.text}
            {pid?.accent ? <span className="text-primary">{pid.accent}</span> : null}
          </span>
          {breedingPower !== undefined ? (
            <span className="hidden shrink-0 items-center gap-0.5 sm:inline-flex" title={breedingPowerLabel}>
              <Zap className="size-3" />
              {breedingPower}
            </span>
          ) : null}
        </span>
        <div className="relative flex h-20 min-h-0 sm:h-24 items-center justify-center bg-[radial-gradient(ellipse_at_center,var(--arkive-filter-active),transparent_70%)] p-3">
          <img
            src={palIconUrl(pal.icon)}
            alt=""
            loading="lazy"
            className="size-14 object-contain sm:size-16"
          />
        </div>
        <div className="flex min-h-12 items-center justify-between gap-2 border-t border-border px-3 py-2 text-left">
          <span className="min-w-0 break-words text-sm font-semibold leading-tight">{name}</span>
          <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
            {pal.elements.map(element => <img key={element} src={elementIconUrl(element)} alt="" className="size-4 object-contain" />)}
          </span>
        </div>
      </Link>
    </PalHover>
  )
}
