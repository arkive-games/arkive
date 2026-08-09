import type { LucideIcon } from 'lucide-react'
import { Anvil, BookOpen, Boxes, FlaskConical, Hammer, Shield, Sparkles, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import type { NavKey } from '../../components/TopNav'

type PageKind = 'database' | 'systems'

const DATABASE: { key: string; icon: LucideIcon }[] = [
  { key: 'items', icon: Boxes },
  { key: 'weapons', icon: Swords },
  { key: 'armor', icon: Shield },
  { key: 'recipes', icon: FlaskConical },
]

const SYSTEMS: { key: string; icon: LucideIcon }[] = [
  { key: 'spells', icon: Sparkles },
  { key: 'passives', icon: Anvil },
  { key: 'buildings', icon: Hammer },
  { key: 'research', icon: BookOpen },
]

export default function KnowledgePage({ kind }: { kind: PageKind }) {
  const { t } = useTranslation()
  const cards = kind === 'database' ? DATABASE : SYSTEMS
  const active = (kind === 'database' ? '/database' : '/systems') as NavKey

  return (
    <ContentPage active={active} title={t(`knowledge.${kind}.title`)} heading>
      <div className="mb-5 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-card p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="size-4" />
          </div>
          <div>
            <p className="font-bold">{t('knowledge.verifiedTitle')}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('knowledge.verifiedCaption')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ key, icon: Icon }) => (
          <section key={key} className="rounded-xl border border-primary/15 bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {t('knowledge.extracting')}
              </span>
            </div>
            <h2 className="mt-4 text-lg font-bold">{t(`knowledge.sections.${key}.title`)}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(`knowledge.sections.${key}.caption`)}</p>
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">{t('knowledge.schemaReady')}</p>
          </section>
        ))}
      </div>
    </ContentPage>
  )
}
