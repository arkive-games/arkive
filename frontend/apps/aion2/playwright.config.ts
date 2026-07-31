import { defineConfig, devices } from "@playwright/test";

// NOT 5173: `reuseExistingServer` means a stray dev server on that port (this
// machine routinely has one, and it is not always aion2) would be tested
// instead of a freshly started aion2. 15188 sits next to aion2's own dev port
// (15173, see CLAUDE.md) and is not handed to any app.
const port = process.env.E2E_PORT ?? "15188";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${port}`, trace: "on-first-retry" },
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
