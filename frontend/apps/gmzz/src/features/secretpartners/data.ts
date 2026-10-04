import { dataUrl, RES_BASE } from '@/lib/urls'

export interface SecretPartner {
  id: number
  name: string
  quality: number
  description: string
  portrait: string
  category: string
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

export async function loadSecretPartners(): Promise<SecretPartner[]> {
  const response = await fetch(dataUrl('secretpartners/secretpartners.json'))
  if (!response.ok) throw new Error(`Unable to load puppets (${response.status})`)
  return response.json()
}

export const portraitUrl = (portrait: string) => `${RES_BASE}/secretpartners/${portrait}.webp`
export const plainText = (value: string) => value.replace(/<[^>]*>/g, '').trim()

export function filterPartners(records: SecretPartner[], query: string, category: string) {
  const needle = query.trim().toLocaleLowerCase()
  return records.filter((record) => (!category || record.category === category)
    && (!needle || `${record.name} ${record.skill.name}`.toLocaleLowerCase().includes(needle)))
}
