import type { ReactElement, ReactNode } from 'react'
import { Hint, TooltipProvider } from '@gamemap/ui'
import { IconHelpCircle, IconInfoCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

/**
 * Every tooltip on the score page goes through these two, so a hover on a
 * desktop and a tap on a phone (where the same content opens as a sheet)
 * behave the same everywhere. Never put an explanation only in `aria-label`:
 * what a screen reader is told, a sighted visitor must be able to read too.
 */

const BODY = 'max-w-xs whitespace-pre-line text-xs leading-5'

/**
 * A small circled mark whose tooltip holds `content`: a question mark for how
 * a number is calculated (`kind="formula"`, the default), an ⓘ for a plain
 * explanation. `on` tints the mark when it points at something in effect.
 */
export function Tip({ content, title, kind = 'formula', on = false, testId, label }: {
  content: ReactNode
  /** The sheet heading on phones; defaults to "Formula" for a formula mark. */
  title?: string
  kind?: 'formula' | 'info'
  on?: boolean
  testId?: string
  /** The mark's accessible name; defaults to the title. */
  label?: string
}) {
  const { t } = useTranslation()
  const heading = title ?? (kind === 'formula' ? t('score.formula') : undefined)
  const Icon = kind === 'formula' ? IconHelpCircle : IconInfoCircle
  return (
    <TooltipProvider delayDuration={150}>
      <Hint content={<div className={BODY}>{content}</div>} title={heading} srTitle={label ?? heading ?? ''}>
        {/* A span, not a button: a button inside a read-only view's
            `<fieldset disabled>` is disabled too and never shows its tooltip. */}
        <span role="button" tabIndex={0} aria-label={label ?? heading} data-testid={testId} className={`gz-tip ${on ? 'on' : ''}`}
          onClick={(event) => event.stopPropagation()}>
          <Icon stroke={1.8} aria-hidden />
        </span>
      </Hint>
    </TooltipProvider>
  )
}

/**
 * Turns an inert element (a value, a label, a badge) into a tooltip trigger.
 * The child must be one element that can take a ref; it is cloned, not wrapped.
 */
export function TipOn({ content, title, children }: { content: ReactNode; title?: string; children: ReactElement }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Hint content={<div className={BODY}>{content}</div>} title={title} srTitle={title ?? ''}>
        {children}
      </Hint>
    </TooltipProvider>
  )
}
