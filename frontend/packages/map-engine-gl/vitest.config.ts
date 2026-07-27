import { defineConfig } from "vitest/config";

// Core (`src/core/`) is framework-free math/state, so the default environment is
// `node`. React-layer tests added later opt into jsdom per file via the
// `// @vitest-environment jsdom` pragma (same convention as map-engine).
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
