import { Link } from '@tanstack/react-router'
import { itemIconUrl } from '../../../lib/assets'
import { ItemHover } from '../../catalog/components'
import { IconImg } from './atoms'

/** A kill-drop item: icon + name + drop rate + quantity range. The item link
 *  carries the standard item hover card (when the items bundle is in context).
 *  `minLevel` marks level-banded drops (only from pals at/above that level). */
export function DropRow({
  id,
  name,
  rate,
  min,
  max,
  icon,
  minLevel,
}: {
  id?: string
  name: string
  rate: number
  min: number
  max: number
  icon?: string
  minLevel?: number
}) {
  const qty = min === max ? `${min}` : `${min}–${max}`
  const label = id ? (
    <ItemHover id={id}>
      <Link to="/items/$id" params={{ id }} className="flex min-w-0 flex-1 items-center gap-2 hover:text-primary">
        {icon ? <IconImg src={itemIconUrl(icon)} alt="" size={20} /> : null}
        <span className="truncate">{name}</span>
      </Link>
    </ItemHover>
  ) : (
    <span className="min-w-0 flex-1 truncate">{name}</span>
  )
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm first:pt-0 last:pb-0">
      {label}
      {minLevel ? (
        <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 text-xs font-medium tabular-nums text-amber-600 dark:text-amber-300">
          Lv{minLevel}+
        </span>
      ) : null}
      <span className="shrink-0 tabular-nums text-muted-foreground">×{qty}</span>
      <span className="w-14 shrink-0 text-right tabular-nums">{rate}%</span>
    </div>
  )
}
