/**
 * Accept any Standard Schema validator (zod, valibot, arktype, typebox) as a
 * record's shape, instead of a hand-written type guard.
 *
 * Why not depend on zod directly: the package only needs the `~standard`
 * interface, and going through it means state-memory has no opinion about which
 * validator an app uses. The repo already ships zod v4 in @gamemap/data-contract,
 * so that is the natural choice at call sites -- but the coupling stays there.
 *
 * Why bother at all: every one of the ~60 records hand-rolled its guard, and two
 * definitions of the SAME key drifted apart (one capped its array length, the
 * other did not), which is precisely the bug a shared schema cannot have.
 */

/** The subset of the Standard Schema v1 interface this package needs. */
export interface StandardSchemaLike<T> {
  readonly "~standard": {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) =>
      | { readonly value: T; readonly issues?: undefined }
      | { readonly issues: readonly unknown[] }
      | Promise<unknown>
  }
}

export function isStandardSchema(value: unknown): value is StandardSchemaLike<unknown> {
  if (!value || typeof value !== "object") return false
  const standard = (value as { "~standard"?: { validate?: unknown } })["~standard"]
  return Boolean(standard) && typeof standard?.validate === "function"
}

/**
 * Turn a schema into the type-guard shape the record system already speaks.
 *
 * Validation here must be synchronous: a record is read during render, so there
 * is nowhere to await. An async validator is treated as a failed validation
 * rather than silently accepted -- returning a promise where a verdict was
 * expected would otherwise read as truthy and let anything through.
 */
export function standardValidator<T>(schema: StandardSchemaLike<T>) {
  const validate = schema["~standard"].validate
  return (value: unknown): value is T => {
    let result: unknown
    try {
      result = validate(value)
    } catch {
      return false
    }
    if (result instanceof Promise) return false
    const verdict = result as { issues?: readonly unknown[] }
    return !verdict?.issues
  }
}
