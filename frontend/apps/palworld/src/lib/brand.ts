/**
 * Where the "Arkive" brand link points.
 *
 * On the web that is the portal site (`VITE_HOME_URL`, same target the footer
 * already uses). Inside a Bilibili toy there is no outside world to link to —
 * every toy is served from `https://www.bilibili.com/toy/<slug>/`, so the
 * portal is published as its own root toy (slug `arkive`, see
 * `apps/meta/toy.config.json`) and the link becomes a same-origin path to it.
 * `index.html` is spelled out because a toy's directory has no index redirect.
 */
/** True in a Bilibili Toy build (`VITE_TOY=1`, set by scripts/toy-build.mjs). */
export const IS_TOY = Boolean(import.meta.env.VITE_TOY)

export const ARKIVE_HOME_URL = IS_TOY
  ? '/toy/arkive/index.html'
  : (import.meta.env.VITE_HOME_URL ?? 'https://tc-imba.com')

/**
 * `target`/`rel` for that link. The web build opens the portal in a new tab so
 * the map state survives; a toy navigates in place — toys run inside Bilibili's
 * own page chrome, where popping a new tab is both jarring and unreliable.
 */
export const ARKIVE_HOME_LINK_PROPS = IS_TOY
  ? // Both keys are always present so a spread can CLEAR a `target="_blank"`
    // written into a shared component's JSX — React drops an attribute set to
    // undefined, whereas an empty object would leave the default in place.
    ({ target: undefined, rel: undefined } as const)
  : ({ target: '_blank', rel: 'noopener noreferrer' } as const)

/**
 * Off-platform links, or `null` inside a toy.
 *
 * A toy is a sealed directory on bilibili.com. Anything pointing at our own
 * hosting either cannot be reached or does not describe this page at all, so
 * the shared chrome is told to omit it rather than render a dead link. `null`
 * means "omit"; `undefined` means "keep the package default".
 */
export const GITHUB_ORG_URL: string | null | undefined = IS_TOY
  ? null
  : import.meta.env.VITE_GITHUB_URL

/** Monorepo URL behind the commit / release links. `undefined` = package default. */
export const REPO_URL: string | null | undefined = IS_TOY ? null : undefined

/** ICP filing — ours, so it must not appear on a page Bilibili serves. */
export const ICP_BEIAN: string | null | undefined = IS_TOY
  ? null
  : import.meta.env.VITE_ICP_BEIAN
