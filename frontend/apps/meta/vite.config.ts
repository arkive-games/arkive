import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { arkiveFontAssets } from '../../vite/arkive-font-assets.ts'

/**
 * Each sibling app's newest changelog date, keyed by app directory, for the
 * homepage's "updated N days ago" badges.
 *
 * Read here rather than imported so the bundle carries one date per game
 * instead of every game's full history. The deploy workflow rebuilds this app
 * on any change under frontend/, so a game's new entry refreshes the badge.
 */
function latestGameUpdates(): Record<string, string> {
  const apps = path.resolve(__dirname, '..')
  const dates: Record<string, string> = {}
  for (const app of readdirSync(apps)) {
    const file = path.join(apps, app, 'src', 'changelog.json')
    if (!existsSync(file)) continue
    const date = JSON.parse(readFileSync(file, 'utf8')).entries?.[0]?.date
    if (typeof date === 'string') dates[app] = date
  }
  return dates
}

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 15172,
    strictPort: true,
    allowedHosts: true,
  },
  plugins: [arkiveFontAssets({ hostsFonts: true }), react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  define: {
    __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME ?? Date.now().toString()),
    __BUILD_GIT_COMMIT__: JSON.stringify(execSync('git rev-parse HEAD').toString().trim()),
    __GAME_UPDATED__: JSON.stringify(latestGameUpdates()),
  },
})
