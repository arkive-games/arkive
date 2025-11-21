import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
import {execSync} from "node:child_process";

function getGitVersion() {
  return execSync("git rev-parse HEAD").toString().trim();
}
const buildTime = process.env.BUILD_TIME ?? Date.now().toString();

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_PUBLIC_BASE || '/aion2-interactive-map/',
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __BUILD_GIT_COMMIT__: JSON.stringify(getGitVersion()),
  },
})
