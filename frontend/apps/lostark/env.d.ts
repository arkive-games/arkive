/// <reference types="vite/client" />
declare const __BUILD_TIME__: string
declare const __BUILD_GIT_COMMIT__: string

interface ImportMetaEnv {
  /** data-lostark base URL in production; dev serves the sibling repo at /data. */
  readonly VITE_DATA_BASE_URL?: string
  readonly VITE_HOME_URL?: string
  readonly VITE_GITHUB_URL?: string
  readonly VITE_ICP_BEIAN?: string
}
