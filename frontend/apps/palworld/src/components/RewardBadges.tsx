import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { cn } from '@gamemap/ui'
import { loadItems, type ItemsBundle } from '../lib/catalog'
import { itemIconUrl } from '../lib/assets'
import type { MarkerRow } from '../lib/data'

const pillClass =
  'inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground'

/**
 * Ancient Shrine reward badges: the gear item the granted schematic unlocks,
 * the reward item itself (schematic — or ticket/consumable for the few
 * non-schematic shrines), and the Dog Coin amount. Item badges link to the
 * item's encyclopedia page; names/icons come from the cached items bundle,
 * so the coins render immediately and the item badges appear once loaded.
 */
export function RewardBadges({ reward }: { reward: NonNullable<MarkerRow['reward']> }) {
  const { i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const [bundle, setBundle] = useState<ItemsBundle | null>(null)

  useEffect(() => {
    let cancelled = false
    loadItems(lng)
      .then((b) => { if (!cancelled) setBundle(b) })
      .catch((err) => console.error(err))
    return () => { cancelled = true }
  }, [lng])

  // The item whose recipe the schematic unlocks (recipe.unlockItemId is
  // unique per unlock item across the dataset; absent for ticket rewards).
  const product = useMemo(
    () => bundle?.items.find((i) => i.recipe?.unlockItemId === reward.item),
    [bundle, reward.item],
  )
  const rewardItem = bundle?.byId.get(reward.item)

  const itemBadge = (item: NonNullable<typeof rewardItem>, testId: string, suffix?: string) => (
    <Link
      to="/items/$id"
      params={{ id: item.id }}
      data-testid={testId}
      className={cn(pillClass, 'transition-colors hover:bg-secondary/80 hover:text-foreground')}
    >
      {item.icon ? (
        <img src={itemIconUrl(item.icon)} alt="" width={16} height={16} className="object-contain" />
      ) : null}
      {bundle?.text[item.id]?.name ?? item.id}
      {suffix}
    </Link>
  )

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-muted-foreground">
      {product ? itemBadge(product, 'marker-reward-product') : null}
      {rewardItem
        ? itemBadge(rewardItem, 'marker-reward-item', reward.count > 1 ? ` ×${reward.count}` : undefined)
        : null}
      {reward.dogCoin ? (
        <span data-testid="marker-reward-coins" className={pillClass}>
          <img src={itemIconUrl('item_DogCoin')} alt="" width={16} height={16} className="object-contain" />
          ×{reward.dogCoin}
        </span>
      ) : null}
    </div>
  )
}
