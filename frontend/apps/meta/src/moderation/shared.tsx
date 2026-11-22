import { useTranslation } from 'react-i18next'
import { cn } from '@gamemap/ui'
import { IconShieldCheck } from '@tabler/icons-react'
import type { ReviewAuthor } from './model'

export function useModerationCopy() {
  const { t } = useTranslation()
  return (key: string, options?: Record<string, string | number>) => t(`contentModeration.${key}`, options)
}

export function TierBadge({ author }: { author: ReviewAuthor }) {
  const m = useModerationCopy()
  return <span className={cn('inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-medium', author.tier === 'restricted' && 'text-destructive')}>
    {author.tier === 'trusted' ? <IconShieldCheck className="size-3.5" aria-hidden="true" stroke={1.8} /> : null}{m(author.tier)}
  </span>
}
