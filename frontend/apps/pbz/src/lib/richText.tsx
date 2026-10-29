import type { ReactNode } from 'react'
import { wikiImage } from './wiki'

/**
 * Renders the wiki's rich text without `innerHTML`. The pipeline reduces the
 * game's markup to a closed vocabulary (see `tools/apps/pbz/wiki/text.py`):
 * `<hl>`, `<up>`, `<warn>`, `<b>` spans, `<key id/>` button prompts and
 * `<icon id/>` inline icons, which are the game's white HUD glyphs and so sit on a
 * dark chip in either theme. Anything else is shown as plain text.
 */
const TOKEN = /<(\/?)(hl|up|warn|b)>|<(key|icon) id="([^"]+)"\/>/g

const STYLE: Record<string, string> = {
  hl: 'font-medium text-amber-600 dark:text-amber-400',
  up: 'font-medium text-emerald-600 dark:text-emerald-400',
  warn: 'font-medium text-red-600 dark:text-red-400',
  b: 'font-semibold',
}

interface Frame { tag: string | null; children: ReactNode[] }

export function parseRichText(text: string, prompts: Record<string, string> = {}): ReactNode[] {
  const stack: Frame[] = [{ tag: null, children: [] }]
  let last = 0
  let n = 0
  const top = () => stack[stack.length - 1]!
  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) top().children.push(text.slice(last, m.index))
    last = m.index + m[0].length
    const [, closing, style, inline, id] = m
    if (style) {
      if (!closing) {
        stack.push({ tag: style, children: [] })
      } else if (stack.length > 1 && top().tag === style) {
        const frame = stack.pop()!
        top().children.push(<span key={n++} className={STYLE[style]}>{frame.children}</span>)
      }
    } else if (inline === 'key') {
      top().children.push(
        <kbd key={n++} className="mx-0.5 inline-flex items-center rounded border border-border bg-muted px-1.5 py-px font-sans text-xs text-foreground">
          {prompts[id!] ?? id}
        </kbd>,
      )
    } else if (inline === 'icon') {
      top().children.push(
        <img key={n++} src={wikiImage(`rich_${id}`)} alt="" className="mx-0.5 inline-block size-[1.3em] rounded-sm bg-neutral-800 p-px align-[-0.25em] object-contain" />,
      )
    }
  }
  if (last < text.length) top().children.push(text.slice(last))
  // Unbalanced input: fold any still-open spans into their parents.
  while (stack.length > 1) {
    const frame = stack.pop()!
    top().children.push(<span key={n++} className={frame.tag ? STYLE[frame.tag] : undefined}>{frame.children}</span>)
  }
  return stack[0]!.children
}

export function RichText({ text, prompts, className }: { text?: string; prompts?: Record<string, string>; className?: string }) {
  if (!text) return null
  return <p className={className ?? 'whitespace-pre-line text-sm leading-relaxed'}>{parseRichText(text, prompts)}</p>
}
