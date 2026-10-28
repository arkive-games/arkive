import { useState } from 'react'
import { qualityPlateUrl } from '@/lib/urls'

/**
 * A square icon tile.
 *
 * The game's own rarity plate sits behind the art — the dark textured square
 * with a coloured bar along its foot that every item in the client is drawn
 * over — so the colour reads the same here as in the bag. It also covers the
 * moment before the icon loads, and stands in for an icon that fails to load
 * rather than leaving the browser's broken-image mark. Without a `src` the
 * plate is all there is; without a `quality` (an empty slot) the tile is a
 * neutral card.
 */
export function IconTile({
  quality,
  label,
  src,
  alt = '',
  className = 'size-10',
}: {
  quality: number | null
  label?: string
  src?: string
  alt?: string
  className?: string
}) {
  const [failed, setFailed] = useState<string | null>(null)
  return (
    <div
      className={`${className} shrink-0 overflow-hidden rounded border border-border bg-muted bg-cover bg-center flex items-center justify-center text-xs font-semibold text-foreground/70`}
      style={quality == null ? undefined : { backgroundImage: `url("${qualityPlateUrl(quality)}")` }}
      data-quality={quality ?? undefined}
    >
      {src && failed !== src ? (
        <img src={src} alt={alt} loading="lazy" className="size-full object-contain" onError={() => setFailed(src)} />
      ) : (
        <span aria-hidden>{label}</span>
      )}
    </div>
  )
}
