import type { TFunction } from 'i18next'

/** Localized label for a quest type (Main / Sub / Hidden), falling back to the
 *  raw enum value when a language has no string for it. */
export function questTypeLabel(type: string, t: TFunction): string {
  const key = `quest.type.${type}`
  const label = t(key)
  return label === key ? type : label
}
