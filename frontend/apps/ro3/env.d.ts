/// <reference types="vite/client" />

// `vite/client` declares ImportMetaEnv with an index signature, so an undeclared
// VITE_* still typechecks — as `any`, silently. Every variable the app reads is
// listed here so a typo is a compile error rather than a runtime `undefined`.
interface ImportMetaEnv {
  readonly VITE_DATA_BASE_URL?: string
  readonly VITE_RESOURCE_BASE_URL?: string
  readonly VITE_HOME_URL?: string
  readonly VITE_GITHUB_URL?: string
  readonly VITE_ICP_BEIAN?: string
  // Sibling RO3 surfaces that do not exist yet. Absent means "not built": the
  // matching entry renders as unavailable rather than linking nowhere.
  readonly VITE_RO3_MAP_URL?: string
  readonly VITE_RO3_GAMEPLAY_URL?: string
  readonly VITE_RO3_TOOLS_URL?: string
  readonly VITE_RO3_WIKI_URL?: string
}
