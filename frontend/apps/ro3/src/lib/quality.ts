/**
 * The game's six item qualities, as the equipment and soul tables name and
 * colour them. One table, so the two encyclopedias and the build manual cannot
 * disagree about what colour "legendary" is.
 */
export const QUALITY_LABELS: Record<number, string> = { 1: '普通', 2: '优秀', 3: '精良', 4: '史诗', 5: '传说', 6: '神话' }

export const QUALITY_COLORS: Record<number, string> = {
  1: '#9a9a9a',
  2: '#55a35f',
  3: '#4d88d4',
  4: '#9a62c5',
  5: '#d6a13d',
  6: '#d05a47',
}

export function qualityColor(quality?: number): string {
  return QUALITY_COLORS[quality ?? 1] ?? QUALITY_COLORS[1]
}

export function qualityLabel(quality?: number): string {
  return QUALITY_LABELS[quality ?? 1] ?? `品质 ${quality}`
}
