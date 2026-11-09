// Square adventure portraits verified in the current exported game resources.
const SQUARE_CARD_PORTRAITS = new Set([
  '1420101', '1420104', '1420106', '1420107', '1420110',
  '1430105', '1430109', '1430117', '1430118',
  '1460100', '1460101', '1460102', '1460103', '1460104', '1460105',
  '1460200', '1460300', '1460401', '1460500', '1460501', '1460702',
])

export function buildCardArt(icon: string): string {
  const match = /^icons\/cards\/card_(\d+)\.webp$/.exec(icon)
  return match && SQUARE_CARD_PORTRAITS.has(match[1]) ? `icons/cards/adventure_${match[1]}.webp` : icon
}
