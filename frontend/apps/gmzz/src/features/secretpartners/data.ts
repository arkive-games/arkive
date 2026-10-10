import { dataUrl, RES_BASE } from '../../lib/urls'

export interface SecretPartner {
  id: number
  name: string
  quality: number
  description: string
  portrait: string
  category: string
  attributes: PartnerAttribute[]
  skill: {
    id: number
    name: string
    tags: string[]
    cooldown: number | null
    description: string
    brief: string
    hasFormula: boolean
    castTargets: string[]
  }
  upgrades: { tier: number; requiredStage: number; description: string }[]
}

export interface PartnerAttribute {
  key: string
  name: string
  format: 'percent' | 'number'
  values: number[]
}

export const PARTNER_QUALITY: Record<number, { color: string; border: string }> = {
  7: { color: 'bg-red-500', border: 'border-red-500' },
  6: { color: 'bg-orange-500', border: 'border-orange-500' },
  5: { color: 'bg-yellow-400', border: 'border-yellow-400' },
  4: { color: 'bg-violet-500', border: 'border-violet-500' },
}

export function partnerLevelBounds(records: SecretPartner[]) {
  const lengths = records.flatMap((record) => (record.attributes ?? []).map((attribute) => attribute.values.length))
  return { min: 1, max: lengths.length ? Math.min(...lengths) : 1 }
}

export function clampPartnerLevel(level: number, max: number) {
  return Math.max(1, Math.min(max, Number.isFinite(level) ? Math.trunc(level) : 1))
}

export function formatPartnerAttribute(attribute: PartnerAttribute, level: number) {
  if (!attribute.values.length) return ''
  const value = attribute.values[clampPartnerLevel(level, attribute.values.length) - 1]
  return attribute.format === 'percent' ? `${Number((value * 100).toFixed(2))}%` : String(value)
}

export async function loadSecretPartners(): Promise<SecretPartner[]> {
  const response = await fetch(dataUrl('secretpartners/secretpartners.json'))
  if (!response.ok) throw new Error(`Unable to load puppets (${response.status})`)
  return response.json()
}

export const portraitUrl = (portrait: string) => `${RES_BASE}/secretpartners/${portrait}.webp`
export const plainText = (value: string) => value.replace(/<[^>]*>/g, '').trim()

export function filterPartners(records: SecretPartner[], query: string, category: string, quality = 0, attribute = '') {
  const needle = query.trim().toLocaleLowerCase()
  return records.filter((record) => (!category || record.category === category)
    && (!quality || record.quality === quality)
    && (!attribute || (record.attributes ?? []).some((entry) => entry.key === attribute))
    && (!needle || `${record.name} ${record.skill.name}`.toLocaleLowerCase().includes(needle)))
}
