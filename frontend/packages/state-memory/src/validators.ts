export const isBoolean = (value: unknown): value is boolean => typeof value === "boolean"
export const isString = (value: unknown): value is string => typeof value === "string"
export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

export function isStringArray(value: unknown, maxItems = 1_000): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string")
}

export function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown
}
