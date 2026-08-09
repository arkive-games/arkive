// Resolve a Toy's numeric id from its slug, reading `toy mylist --json` on stdin.
//
// Why this exists: `toy update` needs an id, but the repo only knows slugs
// (toy.config.json). Hardcoding ids in the workflow would drift silently, and
// `toy create` is NOT an acceptable fallback -- it would publish a SECOND toy and
// a slug is permanent once published, so a lookup miss has to be fatal.
//
// mylist carries no slug field; the slug is a path segment of `url`
// (https://www.bilibili.com/toy/<slug>/index.html). Matching is therefore on the
// exact segment: the account also holds unrelated toys, and a substring match
// would let "arkive" collide with "arkive-aion2".
//
// Usage: toy mylist --json | node scripts/toy-resolve-id.mjs <slug>

/** The slug of a toy list entry, or null when its url is missing/unparseable. */
export function slugOf(entry) {
  if (typeof entry?.url !== "string") return null
  let pathname
  try {
    pathname = new URL(entry.url).pathname
  } catch {
    return null
  }
  const match = /^\/toy\/([^/]+)\//.exec(pathname)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * @returns the entry whose slug matches exactly.
 * @throws when nothing matches, or when the account somehow holds duplicates.
 */
export function findBySlug(payload, slug) {
  const list = payload?.list ?? []
  if (!Array.isArray(list)) throw new Error("unexpected mylist payload: `list` is not an array")

  const matches = list.filter((entry) => slugOf(entry) === slug)
  if (matches.length === 1) return matches[0]

  const known = list.map((entry) => slugOf(entry) ?? "?").join(", ")
  if (matches.length === 0) {
    throw new Error(
      `no toy with slug "${slug}" on this account (found: ${known || "none"}).\n` +
        "Refusing to fall back to `toy create`: that would publish a second toy, " +
        "and a slug cannot be changed once published.",
    )
  }
  throw new Error(`${matches.length} toys share the slug "${slug}" — refusing to guess`)
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
    // The CLI prints a plain-text error when the session is missing or expired.
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
