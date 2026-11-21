/**
 * The current version is injected by Vite from changelog.json. Keeping the
 * history out of this module lets the map entry load a short string while the
 * changelog route fetches its large history chunk only when visited.
 */
export const SITE_VERSION = __SITE_VERSION__
