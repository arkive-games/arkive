import { PawPrint, Sparkles, Swords, Link2, Package, Building2, Store, BookOpen, FlaskConical, Vault, Flag, Tent, Shield, Fish } from 'lucide-react'

/** The same game-owned categories feed top navigation and the encyclopedia rail. */
export const PAL_REFERENCE_ENTRIES = [
  { key: '/pals', labelKey: 'pal.title', icon: PawPrint },
  { key: '/passives', labelKey: 'pal.section.passives', icon: Sparkles },
  { key: '/active-skills', labelKey: 'pal.section.activeSkills', icon: Swords },
  { key: '/partner-skills', labelKey: 'partner.title', icon: Link2 },
] as const
export const DATABASE_REFERENCE_ENTRIES = [
  { key: '/items', labelKey: 'item.title', icon: Package },
  { key: '/buildings', labelKey: 'building.title', icon: Building2 },
  { key: '/merchants', labelKey: 'merchant.title', icon: Store },
  { key: '/technology', labelKey: 'tech.title', icon: BookOpen },
  { key: '/research', labelKey: 'research.title', icon: FlaskConical },
  { key: '/dungeons', labelKey: 'dungeon.title', icon: Vault },
  { key: '/quests', labelKey: 'quest.title', icon: Flag },
  { key: '/basecamp', labelKey: 'basecamp.title', icon: Tent },
  { key: '/raids', labelKey: 'raids.title', icon: Shield },
  { key: '/fishing', labelKey: 'fishing.title', icon: Fish },
] as const
export const isEncyclopediaSection = (active: string) => [...PAL_REFERENCE_ENTRIES, ...DATABASE_REFERENCE_ENTRIES].some(entry => entry.key === active)
