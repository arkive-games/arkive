import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@gamemap/ui'

const TABS = [
  { to: '/fellows', labelKey: 'fellows.title' },
  { to: '/fellows/relations', labelKey: 'fellows.relationsTitle' },
] as const

/**
 * 名录 and 关系, as the game's own 人脉 panel puts them: two tabs of one screen.
 *
 * The nav carries a single 人脉 entry because its menus are one level deep, so
 * this control is the only way from one page to the other. It is a pair of real
 * links rather than state, so each page keeps its own URL and can be shared.
 */
export function FellowsTabs({ current }: { current: (typeof TABS)[number]['to'] }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('nav.fellows')} className="mb-4 inline-flex rounded-md border border-border p-0.5">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          // Exact: by default the router treats /fellows as active on its child
          // /fellows/relations and marks both tabs current for screen readers.
          activeOptions={{ exact: true }}
          aria-current={tab.to === current ? 'page' : undefined}
          className={cn(
            'rounded px-4 py-1.5 text-sm font-medium transition-colors',
            tab.to === current
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {t(tab.labelKey)}
        </Link>
      ))}
    </nav>
  )
}
