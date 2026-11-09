// Native inventory sprites, padded with transparency only; the artwork is unchanged.
const inventoryIcons = import.meta.glob<string>('../assets/native-ui/card-items/item_*.webp', {
  eager: true, query: '?url', import: 'default',
})

export function buildCardArt(icon: string): string {
  const match = /^icons\/cards\/card_(\d+)\.webp$/.exec(icon)
  return match ? inventoryIcons[`../assets/native-ui/card-items/item_${match[1]}.webp`] ?? icon : icon
}
