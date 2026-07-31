/// <reference types="vite/client" />
declare const __BUILD_TIME__: string
declare const __BUILD_GIT_COMMIT__: string

interface ImportMetaEnv {
  /** Set to "1" by scripts/toy-build.mjs when building the Bilibili Toy package. */
  readonly VITE_TOY?: string
  readonly VITE_AION2_URL?: string
  readonly VITE_PAL_URL?: string
  readonly VITE_HOME_URL?: string
  readonly VITE_GITHUB_URL?: string
  readonly VITE_ICP_BEIAN?: string
}
