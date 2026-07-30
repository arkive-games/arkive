import { Fragment, type ReactNode } from 'react'
import type { CardVar } from './data'

/**
 * Renders the game's own card text markup.
 *
 * A description shipped in the pack is a template, not a sentence — the numbers
 * live in the assembly and are spliced in here. Two layers:
 *
 *   `{Damage:diff()}`               the variable's value
 *   `{Cards:plural:card|cards}`     singular/plural chosen by that value
 *   `{Energy:energyIcons()}`        an icon count, rendered as the number
 *   `{X:show: [gold]Upgraded[/gold]}`  shown only on the upgraded card
 *   `[gold]…[/gold]`                the game's keyword highlight
 *
 * Anything unrecognised is left as-is rather than dropped, so a template the
 * game adds later degrades to visible text instead of vanishing silently.
 */

const PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)(?::([^}]*))?\}/g
const TAG = /\[(\/?)([a-zA-Z_][a-zA-Z0-9_]*)\]/g

function valueOf(vars: Record<string, CardVar> | undefined, name: string, upgraded: boolean): number | undefined {
  const v = vars?.[name]
  if (!v) return undefined
  return upgraded ? v.upgraded ?? v.base : v.base
}

export function resolvePlaceholders(
  text: string,
  vars: Record<string, CardVar> | undefined,
  upgraded = false,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string, op: string | undefined) => {
    const value = valueOf(vars, name, upgraded)

    if (op?.startsWith('plural:')) {
      const [singular = '', plural = ''] = op.slice('plural:'.length).split('|')
      return value === 1 ? singular : plural
    }
    if (op?.startsWith('show:')) {
      // Only meaningful on the upgraded rendering; hidden otherwise.
      return upgraded ? op.slice('show:'.length).trim() : ''
    }
    if (value === undefined) return whole
    return String(value)
  })
}

/** Splits `[gold]…[/gold]` markup into styled spans, keeping newlines. */
function renderMarkup(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  const stack: string[] = []
  let last = 0
  let key = 0

  const push = (chunk: string) => {
    if (!chunk) return
    const tag = stack[stack.length - 1]
    const lines = chunk.split('\n')
    lines.forEach((line, i) => {
      if (i > 0) out.push(<br key={`${keyPrefix}-br-${key++}`} />)
      if (!line) return
      out.push(
        tag ? (
          <span key={`${keyPrefix}-t-${key++}`} className="card-keyword">{line}</span>
        ) : (
          <Fragment key={`${keyPrefix}-p-${key++}`}>{line}</Fragment>
        ),
      )
    })
  }

  TAG.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG.exec(text)) !== null) {
    push(text.slice(last, match.index))
    if (match[1]) stack.pop()
    else stack.push(match[2])
    last = match.index + match[0].length
  }
  push(text.slice(last))

  return out
}

export interface CardTextProps {
  text: string
  vars?: Record<string, CardVar>
  /** Render the upgraded values, and reveal any upgrade-only fragments. */
  upgraded?: boolean
  keyPrefix?: string
}

export function CardText({ text, vars, upgraded = false, keyPrefix = 'ct' }: CardTextProps) {
  return <>{renderMarkup(resolvePlaceholders(text, vars, upgraded), keyPrefix)}</>
}

/** Plain-text form, for search indexes and `alt`/`title` attributes. */
export function cardTextToPlain(text: string, vars?: Record<string, CardVar>, upgraded = false): string {
  return resolvePlaceholders(text, vars, upgraded).replace(TAG, '').replace(/\n/g, ' ')
}

/** True when upgrading changes any of the card's numbers. */
export function hasUpgrade(vars: Record<string, CardVar> | undefined): boolean {
  return Object.values(vars ?? {}).some((v) => v.upgraded !== undefined)
}
