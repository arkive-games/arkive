// RarityData.ColorName defines these colors; chess cost is a separate scale.
export const ITEM_QUALITY: Record<number, { color: string; border: string }> = {
  1: { color: 'bg-gray-400', border: 'border-gray-400' },
  2: { color: 'bg-green-500', border: 'border-green-500' },
  3: { color: 'bg-blue-500', border: 'border-blue-500' },
  4: { color: 'bg-violet-500', border: 'border-violet-500' },
  5: { color: 'bg-yellow-400', border: 'border-yellow-400' },
  6: { color: 'bg-orange-500', border: 'border-orange-500' },
  7: { color: 'bg-red-500', border: 'border-red-500' },
}

export const PIECE_COST_BORDER: Record<number, string> = {
  1: 'border-gray-400', 2: 'border-green-500', 3: 'border-blue-500', 4: 'border-violet-500', 5: 'border-yellow-400',
}
