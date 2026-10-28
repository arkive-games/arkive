import path from "node:path"
import { describe, expect, it } from "vitest"
import { MAX_REWRITES, SHELL_FILE, fillShell, outputFile, prerenderedConfig, sitemapPaths } from "./prerender-lib.mjs"

const SHELL = `<!doctype html>
<html lang="en-US">
  <head>
    <title>Game | 藏舟 Arkive</title>
    <meta property="og:title" content="Game | 藏舟 Arkive" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root" class="notranslate" translate="no"></div>
  </body>
</html>
`

describe("sitemapPaths", () => {
  it("reads each location's path once", () => {
    const xml = "<urlset><url><loc>https://a.example/</loc></url><url><loc> https://a.example/x </loc></url><url><loc>https://a.example/x</loc></url></urlset>"
    expect(sitemapPaths(xml)).toEqual(["/", "/x"])
  })
})

describe("outputFile", () => {
  it("maps routes to directory index files", () => {
    expect(outputFile("/")).toBe("index.html")
    expect(outputFile("/a/b")).toBe(path.join("a", "b", "index.html"))
  })

  it("refuses a route that climbs out of dist", () => {
    expect(() => outputFile("/a/../../x")).toThrow()
  })
})

describe("fillShell", () => {
  const page = { title: "Items <All>", lang: "zh-CN", url: "https://a.example/items", rootHtml: '<main>Items</main><script>track()</script>' }

  it("puts the rendered page into the shell", () => {
    const html = fillShell(SHELL, page)
    expect(html).toContain("<title>Items &lt;All&gt;</title>")
    expect(html).toContain('<meta property="og:title" content="Items &lt;All&gt;" />')
    // The apps fall back to <html lang> on a first visit; the render locale must not leak into it.
    expect(html).toContain('<html lang="en-US">')
    expect(html).toContain('<link rel="canonical" href="https://a.example/items" />')
    expect(html).toContain('<div id="root" class="notranslate" translate="no"><div lang="zh-CN"><main>Items</main></div></div>')
  })

  it("leaves the markup unwrapped when the page reported no language", () => {
    const html = fillShell(SHELL, { ...page, lang: "" })
    expect(html).toContain('<div id="root" class="notranslate" translate="no"><main>Items</main></div>')
  })

  it("drops captured scripts but keeps the entry script where it was", () => {
    const html = fillShell(SHELL, page)
    expect(html).not.toContain("track()")
    expect(html).toContain('<script type="module" crossorigin src="/assets/index-abc.js"></script>')
  })

  it("writes a $ in the title or URL literally", () => {
    const html = fillShell(SHELL, { ...page, title: "Cost $1 $&", url: "https://a.example/$1" })
    expect(html).toContain("<title>Cost $1 $&amp;</title>")
    expect(html).toContain('<meta property="og:title" content="Cost $1 $&amp;" />')
    expect(html).toContain('<link rel="canonical" href="https://a.example/$1" />')
  })

  it("replaces a canonical the shell already has", () => {
    const shell = SHELL.replace("</head>", '<link rel="canonical" href="https://a.example/" />\n  </head>')
    expect(fillShell(shell, page).match(/rel="canonical"/g)).toHaveLength(1)
  })

  it("refuses a shell without an empty root", () => {
    expect(() => fillShell(SHELL.replace("></div>", ">x</div>"), page)).toThrow()
  })
})

describe("prerenderedConfig", () => {
  const config = {
    rewrites: [
      { source: "/items", destination: "/index.html" },
      { source: "/items*", destination: "/index.html" },
    ],
    headers: [{ source: "/fonts/*", headers: [] }],
  }

  it("sends each prerendered route to its own file ahead of the shell rules", () => {
    expect(prerenderedConfig(config, ["/", "/items"])).toEqual({
      rewrites: [
        { source: "/items", destination: "/items/index.html" },
        { source: "/items", destination: `/${SHELL_FILE}` },
        { source: "/items*", destination: `/${SHELL_FILE}` },
      ],
      headers: config.headers,
    })
  })

  it("leaves a config with nothing to rewrite alone", () => {
    const headersOnly = { headers: config.headers }
    expect(prerenderedConfig(headersOnly, ["/"])).toBe(headersOnly)
  })

  it("refuses to exceed EdgeOne's rewrite limit", () => {
    const routes = Array.from({ length: MAX_REWRITES }, (_, i) => `/p${i}`)
    expect(() => prerenderedConfig(config, routes)).toThrow(/limit/)
  })
})
