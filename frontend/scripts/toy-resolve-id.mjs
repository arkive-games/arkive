// Resolve a Toy's numeric id from its slug, reading `toy mylist --json` on stdin.
//
// Why this exists: `toy update` needs an id, but the repo only knows slugs
// (toy.config.json). Hardcoding ids in the workflow would drift silently, and
// `toy create` is NOT an acceptable fallback -- it would publish a SECOND toy and
// a slug is permanent once published, so a lookup miss has to be fatal.
//
// mylist carries no slug field; the slug is a path segment of `url`
// (https://www.bilibili.com/toy/<slug>/index.html), parsed by toy-lib's
// slugFromToyUrl. Matching is on the exact segment: the account also holds
// unrelated toys, and a substring match would let "arkive" collide with
// "arkive-aion2".
//
// Usage: toy mylist --json --size 100 | node scripts/toy-resolve-id.mjs <slug>

import { slugFromToyUrl } from './toy-lib.mjs'

/**
 * Unwrap the two shapes the CLI is known to return, and refuse anything else.
 * `toy mylist` normally answers {total, pn, ps, list:[...]}, but toy-publish.mjs
 * also handles a bare array, and an expired session answers an error envelope
 * with a message and no list -- which must NOT be mistaken for an empty account.
 */
export function toyList(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.list)) {
    // A non-zero code alongside a list would mean the list is not authoritative.
    if (payload.code !== undefined && payload.code !== 0) {
      throw new Error(`toy mylist returned an error: ${payload.message ?? `code ${payload.code}`}`)
    }
    // The CLI paginates (default size 20). Searching a truncated page would report
    // a present toy as missing, so make the overflow loud instead.
    const total = payload.total
    if (typeof total === "number" && total > payload.list.length) {
      throw new Error(
        `toy mylist returned ${payload.list.length} of ${total} toys — page size too small to search. ` +
          "Raise --size.",
      )
    }
    return payload.list
  }
  if (typeof payload?.message === "string") {
    throw new Error(`toy mylist returned an error: ${payload.message}`)
  }
  throw new Error("unexpected mylist payload: neither an array nor an object with a `list`")
}

/**
 * @returns the entry whose slug matches exactly.
 * @throws when nothing matches, when duplicates exist, or when the matched entry
 *   carries no usable id -- a bad id must never reach a `writes:true` command.
 */
export function findBySlug(payload, slug) {
  const list = toyList(payload)
  const matches = list.filter((entry) => slugFromToyUrl(entry?.url) === slug)

  if (matches.length > 1) {
    throw new Error(`${matches.length} toys share the slug "${slug}" — refusing to guess`)
  }
  if (matches.length === 0) {
    const known = list.map((entry) => slugFromToyUrl(entry?.url) ?? "?").join(", ")
    throw new Error(
      `no toy with slug "${slug}" on this account (found: ${known || "none"}).\n` +
        "Refusing to fall back to `toy create`: that would publish a second toy, " +
        "and a slug cannot be changed once published.",
    )
  }

  const { id } = matches[0]
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`toy "${slug}" has no usable numeric id (got ${JSON.stringify(id)})`)
  }
  return matches[0]
}

// Only run as a CLI when executed directly, so the tests can import the helpers.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const slug = process.argv[2]
  if (!slug) {
    console.error("usage: toy mylist --json | node scripts/toy-resolve-id.mjs <slug>")
    process.exit(2)
  }

  let raw = ""
  process.stdin.setEncoding("utf8")
  for await (const chunk of process.stdin) raw += chunk

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    // The CLI prints plain text when the session is missing or expired.
    console.error(`toy mylist did not return JSON — is TOY_CLI_SESSION_TOKEN valid?\n${raw.slice(0, 400)}`)
    process.exit(1)
  }

  try {
    process.stdout.write(String(findBySlug(payload, slug).id))
  } catch (error) {
    console.error(error.message)
    process.exit(1)
  }
}
