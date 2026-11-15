import { FlaskConical, Gem, Package, Skull, Sparkles, Sword, Swords } from 'lucide-react'

/** Existing navigation order and mobile-menu symbols, shared with the desktop directory. */
export const REFERENCE_ENTRIES = [
  { key: '/weapons', labelKey: 'nav.weapons', icon: Sword },
  { key: '/phantom-edges', labelKey: 'nav.phantomEdges', icon: Swords },
  { key: '/accessories', labelKey: 'nav.accessories', icon: Gem },
  { key: '/medicines', labelKey: 'nav.medicines', icon: FlaskConical },
  { key: '/items', labelKey: 'nav.items', icon: Package },
  { key: '/enemies', labelKey: 'nav.enemies', icon: Skull },
  { key: '/skills', labelKey: 'nav.skills', icon: Sparkles },
] as const

export const isEncyclopediaSection = (active: string) => REFERENCE_ENTRIES.some(entry => entry.key === active)
