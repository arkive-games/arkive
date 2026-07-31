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
export const ARKIVE_HOME_URL = import.meta.env.VITE_TOY
  ? '/toy/arkive/index.html'
  : (import.meta.env.VITE_HOME_URL ?? 'https://tc-imba.com')

/**
 * `target`/`rel` for that link. The web build opens the portal in a new tab so
 * the map state survives; a toy navigates in place — toys run inside Bilibili's
 * own page chrome, where popping a new tab is both jarring and unreliable.
 */
export const ARKIVE_HOME_LINK_PROPS = import.meta.env.VITE_TOY
  ? {}
  : ({ target: '_blank', rel: 'noopener noreferrer' } as const)
