import { Anvil, BookOpen, Boxes, Database, FlaskConical, Hammer, Shield, Sparkles, Swords } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PageKind, SectionKey } from '../features/knowledge/memory'

export const REFERENCE_ENTRIES = [
  { key: '/vblood', labelKey: 'nav.vblood', icon: Swords },
  { key: '/database', labelKey: 'nav.database', icon: Database },
  { key: '/systems', labelKey: 'nav.systems', icon: BookOpen },
] as const

/** The same category inventory serves the desktop directory and existing mobile cards. */
export const KNOWLEDGE_SECTIONS: Record<PageKind, readonly { key: SectionKey; icon: LucideIcon }[]> = {
  database: [
    { key: 'items', icon: Boxes },
    { key: 'weapons', icon: Swords },
    { key: 'armor', icon: Shield },
    { key: 'recipes', icon: FlaskConical },
  ],
  systems: [
    { key: 'spells', icon: Sparkles },
    { key: 'passives', icon: Anvil },
    { key: 'buildings', icon: Hammer },
    { key: 'research', icon: BookOpen },
  ],
}

export const isEncyclopediaSection = (active: string) => REFERENCE_ENTRIES.some(entry => entry.key === active)

export interface KnowledgeDirectory {
  kind: PageKind
  selected: SectionKey
  available: readonly SectionKey[]
  loading: boolean
  onSelect: (section: SectionKey) => void
}
