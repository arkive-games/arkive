import { defineConfig } from "vitest/config";

// Core (`src/core/`) is framework-free math/state, so the default environment is
// `node`. The React-layer tests (`src/react/*.test.*`) opt into jsdom per FILE
// with a `// @vitest-environment jsdom` pragma — same convention as map-engine,
// and it keeps the fast node default for everything else instead of paying for a
// DOM in 9 out of 11 files.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
