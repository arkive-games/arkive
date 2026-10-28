import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { prerenderedConfig, sitemapPaths } from "./prerender-lib.mjs"

// Every deployed site must be findable: a crawlable index.html carrying the
// brand, a robots.txt pointing at its sitemap, and a sitemap listing only pages
// that EdgeOne can actually serve. The deploy matrix is read rather than
// copied, so a newly deployed app is held to the same rules the day it ships.
const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..")
const DEPLOY = readFileSync(join(FRONTEND, "..", ".github", "workflows", "deploy.yml"), "utf8")

const SITES = [...DEPLOY.matchAll(/- app: (\S+)\s+project: \S+\s+domain: (\S+)/g)]
  .map(([, app, domain]) => ({ app, domain }))

const read = (app, file) => readFileSync(join(FRONTEND, "apps", app, file), "utf8")

// EdgeOne serves `/` from index.html and every other client route only through
// an enumerated rewrite; `/x/*` covers anything nested under `/x/`.
function servable(path, sources) {
  if (path === "/") return true
  return sources.some((source) =>
    source === path || (source.endsWith("/*") && path.startsWith(source.slice(0, -1))))
}

describe("search engine discovery", () => {
  it("finds the deployed sites", () => {
    expect(SITES.map((site) => site.app)).toContain("meta")
    expect(SITES.length).toBeGreaterThan(1)
  })

  for (const { app, domain } of SITES) {
    describe(app, () => {
      it("has an indexable, branded index.html", () => {
        const html = read(app, "index.html")
        expect(html).not.toMatch(/name="robots"[^>]*noindex/)
        expect(html).toMatch(/<title>[^<]*藏舟[^<]*<\/title>/)
        expect(html).toMatch(/<meta name="description"/)
      })

      it("points robots.txt at its own sitemap", () => {
        const robots = read(app, "public/robots.txt")
        expect(robots).toContain(`Sitemap: https://${domain}/sitemap.xml`)
        expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m)
      })

      it("lists only servable pages on its own host", () => {
        const sources = JSON.parse(read(app, "edgeone.json")).rewrites?.map((rule) => rule.source) ?? []
        const locs = [...read(app, "public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc)
        expect(locs).toContain(`https://${domain}/`)
        for (const loc of locs) {
          const url = new URL(loc)
          expect(url.host).toBe(domain)
          expect(servable(url.pathname, sources), loc).toBe(true)
        }
      })

      // The deploy prerenders every sitemap page and gives each its own rewrite;
      // EdgeOne rejects the whole config once that pushes it past its limit.
      it("stays within EdgeOne's rewrite limit once prerendered", () => {
        const config = JSON.parse(read(app, "edgeone.json"))
        expect(() => prerenderedConfig(config, sitemapPaths(read(app, "public/sitemap.xml")))).not.toThrow()
      })
    })
  }
})
