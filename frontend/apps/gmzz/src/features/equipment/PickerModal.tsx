import { useMemo, useState, type ReactNode } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

/** One selectable thing: an icon tile, a name, and a line of detail. */
export type PickerOption = {
  id: number
  name: string
  /** Rendered under the name — gear level for an item, group/risk for a relic. */
  detail: string
  /** Tints the tile border by rarity. */
  quality: number | null
  /** Icon URL. Falls back to a tinted tile when absent. */
  iconUrl?: string
  /** Extra searchable text that is not displayed. */
  keywords?: string
}

/** Quality tints, worst to best. Indexed by `quality` with a clamp. */
const QUALITY_TILE = [
  'from-zinc-500/40 to-zinc-800/60 border-zinc-500/50',
  'from-zinc-500/40 to-zinc-800/60 border-zinc-500/50',
  'from-emerald-500/40 to-emerald-900/60 border-emerald-500/50',
  'from-sky-500/40 to-sky-900/60 border-sky-500/50',
  'from-violet-500/40 to-violet-900/60 border-violet-500/50',
  'from-amber-500/40 to-amber-900/60 border-amber-500/50',
  'from-rose-500/40 to-rose-900/60 border-rose-500/50',
  'from-fuchsia-500/40 to-fuchsia-900/60 border-fuchsia-500/50',
]

export function qualityTile(quality: number | null): string {
  const index = Math.min(Math.max(quality ?? 0, 0), QUALITY_TILE.length - 1)
  return QUALITY_TILE[index]
}

/**
 * A square icon tile.
 *
 * The rarity gradient stays behind the art: it is the border and backdrop the
 * game uses to signal quality, and it also covers the moment before the image
 * loads. Without a `src` the tile is all there is.
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
      className={`${className} shrink-0 overflow-hidden rounded border bg-gradient-to-br ${qualityTile(quality)} flex items-center justify-center text-xs font-semibold text-foreground/70`}
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
      <DialogContent className="max-w-3xl">
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
