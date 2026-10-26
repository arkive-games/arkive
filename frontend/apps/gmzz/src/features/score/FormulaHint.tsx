import type { ReactNode } from 'react'
import { Hint, TooltipProvider } from '@gamemap/ui'
import { IconHelpCircle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

/**
 * How a number is calculated, kept out of the way: a circled question mark
 * whose tooltip (a sheet on phones) holds the formula. Every calculation note
 * on the score page goes through this one control, so the details show inputs
 * and results and the arithmetic is one hover away.
 */
export function FormulaHint({ children, testId }: { children: ReactNode; testId?: string }) {
  const { t } = useTranslation()
  return (
    <TooltipProvider delayDuration={150}>
      <Hint content={<div className="max-w-xs whitespace-pre-line text-xs leading-5">{children}</div>} title={t('score.formula')}>
        <button type="button" aria-label={t('score.formula')} data-testid={testId}
          className="inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]">
          <IconHelpCircle className="size-4" stroke={1.8} aria-hidden />
        </button>
      </Hint>
    </TooltipProvider>
  )
}
