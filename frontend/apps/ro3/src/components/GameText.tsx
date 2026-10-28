import { Fragment } from 'react'

/**
 * The game's rich text: the values it colours are the ones that grow with the
 * level, so they keep an emphasis -- in the theme's accent rather than the
 * game's own hex, which is unreadable on a dark page. Bracketed names (status
 * effects, skills) take the page's `--ro3-stage` colour.
 */
export function GameText({ value }: { value: string }) {
  const plain = value
    .replace(/<link(?:=[^>]*)?>/gi, '')
    .replace(/<\/link>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
  const parts = plain.split(/<color(?:=[^>]*)?>([\s\S]*?)<\/color>/gi)
  return (
    <>
      {parts.map((part, index) => index % 2 === 1 ? (
        <b key={index} className="font-semibold text-[color:var(--arkive-nav-active)]">{part}</b>
      ) : <Keywords key={index} value={part.replace(/<\/?color(?:=[^>]*)?>/gi, '')} />)}
    </>
  )
}

/** Splits on the full-width lenticular brackets the game wraps names in. */
function Keywords({ value }: { value: string }) {
  const parts = value.split(/(\u3010[^\u3011]+\u3011)/)
  return (
    <>
      {parts.map((part, index) => index % 2 === 1 ? (
        <span key={index} className="font-semibold text-[color:var(--ro3-stage)]">{part}</span>
      ) : <Fragment key={index}>{part}</Fragment>)}
    </>
  )
}
