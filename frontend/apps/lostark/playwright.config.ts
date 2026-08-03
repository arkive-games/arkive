import { defineConfig, devices } from '@playwright/test'

// Distinct from the other apps' e2e ports (aion2 5173, palworld 5188,
// sts2 5189, vrising 5190) so suites can run side by side without fighting
// over a server.
const port = Number(process.env.E2E_PORT ?? 5191)

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  webServer: {
    command: `pnpm dev --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
