import { Fragment, type ReactNode } from 'react'

/**
 * Renders the tiny `<c #rrggbb>…</c>` markup the pipeline emits.
 *
 * Those colours are the game's own — the client marks numbers green, "命运"
 * purple and durations yellow — so they are carried through rather than
 * re-derived here. Deriving them would mean regex-matching numerals and
 * keywords, which misses whatever the game highlights that we did not predict.
 *
 * `muted` renders the whole string in one colour instead, for effects a core has
 * not activated yet: the game greys those out wholesale rather than keeping the
 * accent colours.
 */
const SPAN = /<c (#[0-9a-f]{6})>([\s\S]*?)<\/c>/g

export function RichText({ text, muted = false }: { text: string; muted?: boolean }) {
  if (muted) return <>{text.replace(/<\/?c(?: #[0-9a-f]{6})?>/g, '')}</>

  const parts: ReactNode[] = []
  let cursor = 0
  for (const match of text.matchAll(SPAN)) {
    const at = match.index ?? 0
    if (at > cursor) parts.push(text.slice(cursor, at))
    parts.push(
      <span key={`${at}-${match[1]}`} style={{ color: match[1] }}>
        {match[2]}
      </span>,
    )
    cursor = at + match[0].length
  }
  if (cursor < text.length) parts.push(text.slice(cursor))

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  )
}

/** Plain text with every colour span removed, for labels and titles. */
export function plainText(text: string): string {
  return text.replace(/<\/?c(?: #[0-9a-f]{6})?>/g, '')
}
