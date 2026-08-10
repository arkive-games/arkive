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
 *
 * IMPORTANT -- the schema is used as a VALIDATOR ONLY. A Standard Schema may also
 * transform (`z.coerce.number()`, `.default()`, `.transform()`, object stripping),
 * and that output is discarded: the stored value is returned exactly as it was
 * read. A coercing schema would therefore typecheck as `number` while handing back
 * the stored `"42"`. Declare records with non-transforming schemas, and do any
 * normalisation in `migrateLegacy` or `migrate`, where it is explicit.
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
    // Duck-typed, not `instanceof Promise`: a promise from another realm (an
    // iframe) is not an instance of this realm's Promise, and a spec-compliant
    // custom thenable is not one either. Either would fall through with no
    // `issues` property and be read as a pass.
    if (result && typeof (result as { then?: unknown }).then === "function") return false
    const verdict = result as { issues?: readonly unknown[] }
    return !verdict?.issues
  }
}
