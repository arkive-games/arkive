import { dataUrl, RES_BASE } from '@/lib/urls'

export type UtopiaCard = {
  cardId: number
  quality: number
  /** Client `Tag` — the broad group a card belongs to. */
  tag: string
  name: string
  description: string
  buffId: number
  mutexCardIds: number[]
  /** Icon basename under `resource-gmzz/utopia/`. */
  icon: string
}

/**
 * Card art. A separate directory from the train-trade item icons: these are
 * skill glyphs shared across the client, keyed by asset name rather than by id.
 */
export function utopiaIconUrl(icon: string): string {
  return `${RES_BASE}/utopia/${icon}.webp`
}

export async function loadUtopiaCards(): Promise<UtopiaCard[]> {
  const response = await fetch(dataUrl('utopia/cards.json'))
  if (!response.ok) throw new Error(`Unable to load Utopian Theater cards (${response.status})`)
  const payload: unknown = await response.json()
  if (!Array.isArray(payload)) throw new Error('Invalid Utopian Theater data')
  return payload as UtopiaCard[]
}

/**
 * The card groups present in the data, in first-seen order.
 *
 * Grouping is by the client's `Tag`, not by Beyonder pathway: the pathway split
 * for the 200 pathway-locked cards is in no table the export contains, so it is
 * not shown rather than guessed. See `tools/apps/gmzz/utopia.py`.
 */
export function tagsOf(cards: UtopiaCard[]): string[] {
  return [...new Set(cards.map((card) => card.tag))]
}
