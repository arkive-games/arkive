/**
 * The text roles the calculator pages are set in.
 *
 * Every piece of text on the score page is one of these, so a size or weight
 * is decided once here rather than at each call site — which is how the
 * equipment section had drifted into a dozen ad-hoc `text-xs font-semibold`
 * variants that almost, but not quite, matched. Sizes are Tailwind scale steps
 * only (no pixel values), so they follow the root font-size like everything
 * else. Colour is part of the role where it always goes with it (a label is
 * always muted); a role that can be either colour leaves it to the caller.
 */
export const TYPE = {
  /** The page's own title. */
  pageTitle: 'text-3xl font-bold text-foreground',
  /** A section of the page: 装备评分, 封印物. */
  sectionTitle: 'text-xl font-bold text-foreground',
  /** The name of a thing: an item, a grace, a relic. */
  name: 'text-sm font-bold text-foreground',
  /** A field or column label, and the small headings inside a card. */
  label: 'text-xs font-semibold text-muted-foreground',
  /** Running text: descriptions, hints, effects. */
  body: 'text-xs leading-5 text-muted-foreground',
  /** A figure that matters: a score, a stat, a reading. */
  value: 'text-xs font-semibold tabular-nums text-foreground',
  /** A figure in passing: a subtotal, a Mark, a percentage on a scale. */
  valueMuted: 'text-xs tabular-nums text-muted-foreground',
  /** The one big number of a panel. */
  total: 'text-2xl font-bold tabular-nums text-foreground',
  /** Text inside a control: inputs, selects, buttons. */
  control: 'text-xs',
} as const
