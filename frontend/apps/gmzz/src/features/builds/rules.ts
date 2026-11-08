import type { Catalog, ConditionMeta } from './data'
import type { ComboNode, Condition } from './model'

export function buffOptions(catalog: Catalog, id: number, professionId: number) {
  return catalog.buffs.filter((buff) => (!buff.professions.length || buff.professions.includes(professionId))
    && (id !== 1 || buff.status) && (id !== 2 || !buff.status))
}

export function defaultCondition(catalog: Catalog, id: number, professionId: number): Condition {
  const meta = catalog.conditions.find((entry) => entry.ID === id)!
  return [id, meta.ParamType.map((type, index) => {
    if (type === 1) return buffOptions(catalog, id, professionId)[0]?.id ?? 1
    if (type === 8) return 1
    if (type === 9) return 0
    if (type === 7) return 17
    if (id === 8 && index === 1) return 2
    return meta.Limit[index]?.[1] ?? 0
  })]
}

export function conditionLimits(meta: ConditionMeta, at: number, catalog: Catalog, professionId: number): [number, number] | null {
  if (meta.ID === 7 && at === 1) return [catalog.resources.find((row) => row.professionId === professionId)?.max ?? 0, 0]
  const range = meta.Limit[at]
  return range && (range[0] !== 0 || range[1] !== 0) ? [range[0], range[1]] : null
}

export function validConditions(node: ComboNode, catalog: Catalog, professionId: number): boolean {
  return node[1].every((group) => group.every(([id, params]) => {
    const meta = catalog.conditions.find((row) => row.ID === id)
    // Retain future client conditions without interpreting or discarding them.
    if (!meta) return true
    if (params.length !== meta.ParamType.length || (meta.ProfessionUseLimit && !meta.ProfessionUseLimit.includes(professionId))) return false
    if (id === 7 && !catalog.resources.some((row) => row.professionId === professionId && row.supported)) return false
    if (id === 8 && params[1] !== 1 && params[1] !== 2) return false
    return params.every((value, at) => {
      const type = meta.ParamType[at]
      const limit = conditionLimits(meta, at, catalog, professionId)
      if (limit && (value < limit[1] || value > limit[0])) return false
      if (type === 2) return Number.isInteger(value) && value >= 0 && value <= 4
      if (type === 8 || type === 9) return value === 0 || value === 1
      if (type === 1 || type === 7) return Number.isSafeInteger(value) && value > 0
      if (type === 3) return Number.isInteger(value)
      return true
    })
  }))
}
