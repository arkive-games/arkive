import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@gamemap/ui'
import { FELLOW_REFERENCE_TABS as TABS } from '../../components/navGroups'

/**
 * Roster and Relations, as the game's own Connections panel puts them: two tabs of
 * one screen.
 *
 * The mobile control retains two real links and shareable routes. Desktop uses
 * the same entries as children of Connections in the encyclopedia rail.
 */
export function FellowsTabs({ current }: { current: (typeof TABS)[number]['to'] }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('nav.fellows')} className="mb-4 inline-flex rounded-md border border-border p-0.5 lg:hidden">
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
