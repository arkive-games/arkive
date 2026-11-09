const art = import.meta.glob<string>('../assets/native-ui/item-frames/*.webp', { eager: true, query: '?url', import: 'default' })
const colors = ['ash', 'green', 'blue', 'purple', 'yellow', 'red']
export function itemQualityFrame(quality?: number): string | undefined {
  if (!quality || quality < 1 || quality > colors.length) return
  return art[`../assets/native-ui/item-frames/common_icon_item_0${quality}_${colors[quality - 1]}.webp`]
}
export function itemPartArt(part?: number): string | undefined {
  const name = ['weapon', 'offhand', 'armor', 'cloak', 'shoes', 'accessory'][(part ?? 0) - 1]
  return name ? art[`../assets/native-ui/item-frames/part_${name}.webp`] : undefined
}
export function itemRankGlyphs(rank: number): string[] {
  if (!Number.isSafeInteger(rank) || rank < 1) return []
  return ['t', ...String(rank)].map(glyph => art[`../assets/native-ui/item-frames/common_equip_num_${glyph}.webp`]).filter(Boolean)
}
