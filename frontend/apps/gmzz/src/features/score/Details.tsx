import type { ReactNode } from 'react'
import { useMemory } from '@gamemap/state-memory'
import { IconChevronDown, IconChevronLeft } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { useCharacterReadOnly } from '@/features/characters/CharacterProvider'
import { gmzzMemory, isRecord } from '@/lib/memory'

/** Which details the player has folded away, by id; anything absent is open. */
type Folded = Record<string, boolean>

const foldedDraft = gmzzMemory.draft('score/folded', {
  default: (): Folded => ({}),
  validate: (value: unknown): value is Folded => isRecord(value) && Object.values(value).every((v) => typeof v === 'boolean'),
})

/**
 * One detail's open state, remembered across reloads. A read-only character
 * shows every detail, since a visitor came to see the whole build and every
 * control that would fold one is disabled with the rest.
 */
export function useDetailsOpen(id: string): readonly [boolean, () => void] {
  const [folded, setFolded] = useMemory(foldedDraft)
  const readOnly = useCharacterReadOnly()
  if (readOnly) return [true, () => {}] as const
  const open = !folded[id]
  return [open, () => setFolded((prev) => ({ ...prev, [id]: open }))] as const
}

/**
 * The one fold control on the score page: "展开详情 / 收起详情" and a chevron
 * pointing down while the detail is open, left while it is folded.
 * Every detail — an item's own calculator and a calculator shared by a whole
 * group — opens and closes through this button, so they all read the same.
 */
export function DetailsToggle({ open, onToggle, controls, testId }: {
  open: boolean; onToggle: () => void; controls: string; testId: string
}) {
  const { t } = useTranslation()
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls} data-testid={testId}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-[color:var(--arkive-nav-accent)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]">
      {t(open ? 'score.detailsHide' : 'score.detailsShow')}
      {open
        ? <IconChevronDown className="size-4" stroke={1.8} aria-hidden />
        : <IconChevronLeft className="size-4" stroke={1.8} aria-hidden />}
    </button>
  )
}

/**
 * The body of a detail. Folded content stays mounted and is only hidden: the
 * calculators inside report their totals up to the page while they live, so
 * unmounting one would drop its score from the rating.
 */
export function DetailsBody({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div id={id} hidden={!open} className="mt-2.5 border-t border-border/70 pt-2.5">
      {children}
    </div>
  )
}
