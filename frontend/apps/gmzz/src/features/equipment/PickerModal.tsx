import { useMemo, useState, type ReactNode } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { qualityPlateUrl } from '@/lib/urls'

/** One selectable thing: an icon tile, a name, and a line of detail. */
export type PickerOption = {
  id: number
  name: string
  /** Rendered under the name — gear level for an item, group/risk for a relic. */
  detail: string
  /** Picks the rarity plate behind the icon; null draws a neutral tile. */
  quality: number | null
  /** Icon URL. Falls back to the bare plate when absent. */
  iconUrl?: string
  /** Extra searchable text that is not displayed. */
  keywords?: string
}

/**
 * A square icon tile.
 *
 * The game's own rarity plate sits behind the art — the dark textured square
 * with a coloured bar along its foot that every item in the client is drawn
 * over — so the colour reads the same here as in the bag. It also covers the
 * moment before the icon loads. Without a `src` the plate is all there is;
 * without a `quality` (an empty slot) the tile is a neutral card.
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
  return (
    <div
      className={`${className} shrink-0 overflow-hidden rounded border border-border bg-muted bg-cover bg-center flex items-center justify-center text-xs font-semibold text-foreground/70`}
      style={quality == null ? undefined : { backgroundImage: `url("${qualityPlateUrl(quality)}")` }}
      data-quality={quality ?? undefined}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy" className="size-full object-contain" />
      ) : (
        <span aria-hidden>{label}</span>
      )}
    </div>
  )
}

/**
 * A searchable icon-grid picker in a modal.
 *
 * Used for both equipment and relics: with 462 items across 8 slots a `<select>`
 * cannot show an icon or a gear level, and those are what a player recognises a
 * piece by.
 */
export default function PickerModal({
  open,
  onOpenChange,
  title,
  options,
  selectedId,
  onSelect,
  footer,
  testIdPrefix = 'picker',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  options: PickerOption[]
  selectedId: number | null
  onSelect: (id: number) => void
  footer?: ReactNode
  /** Scopes the option test ids, so two pickers are distinguishable. */
  testIdPrefix?: string
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return options
    return options.filter((option) =>
      `${option.name} ${option.detail} ${option.keywords ?? ''}`.toLocaleLowerCase().includes(needle),
    )
  }, [options, query])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <label className="block">
          <span className="relative block">
            <IconSearch
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              stroke={1.8}
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('equip.pickerSearch')}
              className="h-9 border-border bg-background pl-9 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
              data-testid={`${testIdPrefix}-search`}
            />
          </span>
        </label>

        {shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('equip.pickerEmpty')}</p>
        ) : (
          <div className="max-h-[26rem] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={option.id === selectedId}
                  onClick={() => {
                    onSelect(option.id)
                    onOpenChange(false)
                  }}
                  data-testid={`${testIdPrefix}-option-${option.id}`}
                  className={`flex min-w-0 items-center gap-2 rounded-md border p-2 text-left transition-colors ${
                    option.id === selectedId
                      ? 'border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)]'
                      : 'border-border bg-card hover:border-[color:var(--arkive-nav-accent)]/60'
                  }`}
                >
                  <IconTile quality={option.quality} src={option.iconUrl} alt={option.name} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-5 text-foreground" title={option.name}>
                      {option.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{option.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {footer}
      </DialogContent>
    </Dialog>
  )
}
