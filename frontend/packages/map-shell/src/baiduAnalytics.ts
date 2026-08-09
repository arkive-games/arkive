/**
 * Baidu Tongji (百度统计) for the Arkive sites.
 *
 * The vendor snippet is a plain `<script>` meant for a server-rendered page. It
 * lives here instead of in each app's `index.html` for two reasons: every site
 * shares one site id, and hm.js only counts the page it loads on — an SPA that
 * never reloads would report a single pageview per visit, so client-side
 * navigations have to be pushed by hand.
 */

/**
 * One site id across every subdomain, so all Arkive traffic lands in a single
 * report; the per-site split comes from the URLs recorded under it.
 */
export const ARKIVE_BAIDU_SITE_ID = "5f5baeddf1f242f225a5a1f6df269088"

const SCRIPT_ID = "baidu-hm"

/** hm.js drains this queue when it loads, so pushes made before it arrives survive. */
type HmQueue = unknown[][]

interface HmWindow extends Window {
  _hmt?: HmQueue
}

export interface InitBaiduAnalyticsOptions {
  siteId?: string
  dev?: boolean
  toy?: boolean
}

let started = false
/** Last URL reported, so the entry page is not counted twice. */
let lastPath: string | null = null

function currentPath(): string {
  return window.location.pathname + window.location.search
}

/**
 * Load hm.js once. Like the rest of the shell this reads no environment of its
 * own — the app passes `dev`/`toy` in (see `resolveArkiveHomeUrl`).
 */
export function initBaiduAnalytics({
  siteId = ARKIVE_BAIDU_SITE_ID,
  dev = false,
  toy = false,
}: InitBaiduAnalyticsOptions = {}): void {
  // Dev traffic would pollute the report, and a Toy build runs inside a Bilibili
  // iframe where the visit is Bilibili's to count, not ours.
  if (dev || toy) return
  if (typeof document === "undefined") return
  if (document.getElementById(SCRIPT_ID)) return

  const win = window as HmWindow
  win._hmt = win._hmt ?? []
  // hm.js reports the entry page itself, and the router fires its first
  // navigation for that same URL — seed the dedupe so it is not double-counted.
  lastPath = currentPath()
  started = true

  const script = document.createElement("script")
  script.id = SCRIPT_ID
  script.async = true
  script.src = `https://hm.baidu.com/hm.js?${siteId}`
  document.head.appendChild(script)
}

/**
 * Report a client-side navigation. Defaults to the current URL, which is the
 * one the visitor sees and sidesteps every router's own path formatting.
 * Repeats of the page already reported are dropped.
 */
export function trackPageview(path?: string): void {
  if (!started) return
  const next = path ?? currentPath()
  if (next === lastPath) return
  lastPath = next
  ;(window as HmWindow)._hmt?.push(["_trackPageview", next])
}
