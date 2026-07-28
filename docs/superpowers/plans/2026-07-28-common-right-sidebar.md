# Common Right Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give both sites a shared site-info / feedback panel — a collapsible right sidebar on the desktop map plus the same content in each app's top-bar popover and mobile More sheet — carrying a short intro, an affiliation disclaimer, and the QQ group 1091411026 with a copy button.

**Architecture:** One presentational `SiteInfoPanel` in `packages/map-shell` takes rendered nodes and labels as props (packages stay i18n-free and storage-free). `ShellSidebar` gains a `side` prop and `ShellLayout` a `rightSidebar` slot, so the right sidebar reuses the left one's collapse mechanics. Each app owns its text (aion2: YAML locales; palworld: a 17-locale TS table), its localStorage key for the remembered collapse state, and its three host sites.

**Tech Stack:** React 19, TypeScript, Tailwind v4, vitest + @testing-library/react (jsdom), Playwright, i18next (react-i18next), pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-07-28-common-right-sidebar-design.md`

---

## Context an implementer needs

Run everything from `E:\arkive-games\arkive\frontend` unless a step says otherwise.

- `pnpm test` runs vitest from the workspace root config (`frontend/vitest.config.ts`). Global environment is `node`; component tests opt into jsdom with a `// @vitest-environment jsdom` docblock on line 1. See `packages/map-shell/src/FilterPanel.test.tsx` for the exact idiom.
- `pnpm check:shell` greps `packages/map-shell/src` for `i18next|useTranslation|react-router|import.meta.env|localStorage|fetch(|@/` and **fails if any match**. It matches comments too. Never write those tokens in that directory.
- Both apps hide their desktop top bar below `md` (`hidden … md:flex`) and use a `BottomTabBar` with a bottom "More" sheet instead. Both map routes early-return a separate mobile tree, so the right sidebar is desktop-only for free.
- Dev ports are fixed: aion2 `15173`, palworld `15174`. Playwright uses its own ports (aion2 `E2E_PORT ?? 5173`, palworld `E2E_PORT ?? 5188`). **Always pass `E2E_PORT` for aion2** — its default `5173` will silently reuse an unrelated dev server.
- Known-failing baselines, do not try to fix: aion2 e2e is 25 pass / 1 fail (`wiki.spec.ts` embedded-map POI); palworld has 2 failures (ko-KR smoke, dungeons "Hard · bonus"). Anything beyond those is a regression you caused.
- Commits must be signed. Plain `git commit` signs automatically; never pass `--no-gpg-sign`.
- Stage explicit paths. Never `git add -A` — the user edits files concurrently.
- Never hard-code pixel font sizes. Use Tailwind scale steps; `text-xs` is the floor for in-content text.
- **Version bump at commit.** Each app owns `apps/<app>/src/changelog.json`, newest entry first, and a user-visible change must bump it *in the same commit*. This feature is one `MINOR` bump per app, on the commit that completes that app's visible feature: **Task 5** for aion2 (1.6.0 → 1.7.0) and **Task 8** for palworld (1.8.0 → 1.9.0). Tasks 3, 4, 6 and 7 are steps toward those releases and carry no entry of their own — one feature, one version. Use the helper rather than hand-editing JSON; `pnpm test` validates ordering, dates and locale coverage.
- **Live testing happens after the merge back**, per the workspace convention. Inside the worktree, run unit tests, typecheck, lint, builds and Playwright (it starts its own server on its own port). The browser checks marked *deferred* below run once, together, after this branch is rebased onto `master` — a dev server in the worktree would collide with the fixed ports `15173`/`15174` that the main workspace already uses.

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `packages/map-shell/src/SiteInfoPanel.tsx` | Presentational panel: sections + optional feedback-group card with copy button |
| `packages/map-shell/src/SiteInfoPanel.test.tsx` | Component tests for the above |
| `packages/map-shell/src/ShellSidebar.test.tsx` | Tests for the new `side` prop |
| `apps/aion2/src/features/map/sidebar/InfoSidebar.tsx` | aion2 right sidebar: `ShellSidebar side="right"` + collapse persistence |
| `apps/aion2/src/components/SiteInfo.tsx` | aion2 i18n → `SiteInfoPanel` adapter (used by all three hosts) |
| `apps/palworld/src/components/InfoSidebar.tsx` | palworld right sidebar |
| `apps/palworld/src/components/SiteInfo.tsx` | palworld i18n → `SiteInfoPanel` adapter |
| `apps/palworld/src/siteInfoStrings.ts` | 17-locale `Record<Language, SiteInfoStrings>` |
| `apps/aion2/e2e/site-info.spec.ts` | aion2 e2e |
| `apps/palworld/e2e/site-info.spec.ts` | palworld e2e |

**Modify:**

| Path | Change |
|---|---|
| `packages/map-shell/src/ShellSidebar.tsx` | Add `side?: "left" \| "right"` |
| `packages/map-shell/src/ShellLayout.tsx` | Add `rightSidebar?: ReactNode` |
| `packages/map-shell/src/index.ts` | Export `SiteInfoPanel` + its types |
| `apps/aion2/public/locales/{zh-CN,zh-TW,en-US,ko-KR}/common.yaml` | `rightSidebar` → `siteInfo`, add keys |
| `apps/aion2/src/components/TopNavbar.tsx` | Popover body → `<SiteInfo />` |
| `apps/aion2/src/components/BottomTabBar.tsx` | Inline contact section → `<SiteInfo />` |
| `apps/aion2/src/features/map/MapRoute.tsx` | Pass `rightSidebar` to `ShellLayout` |
| `apps/aion2/src/changelog.json` | MINOR bump 1.6.0 → 1.7.0 (Task 5) |
| `apps/palworld/src/changelog.json` | MINOR bump 1.8.0 → 1.9.0 (Task 8) |
| `apps/palworld/src/i18n.ts` | Merge `siteInfo` bundle |
| `apps/palworld/src/components/TopNav.tsx` | Add info popover to `rightExtras` |
| `apps/palworld/src/components/BottomTabBar.tsx` | Add info section, make the sheet scrollable |
| `apps/palworld/src/App.tsx` | Pass `rightSidebar` to `ShellLayout` |

---

## Task 1: `SiteInfoPanel` component

**Files:**
- Create: `packages/map-shell/src/SiteInfoPanel.tsx`
- Create: `packages/map-shell/src/SiteInfoPanel.test.tsx`
- Modify: `packages/map-shell/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/map-shell/src/SiteInfoPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SiteInfoPanel } from "./SiteInfoPanel"

afterEach(cleanup)

const sections = [
  { title: "About", body: <p>An unofficial fan site.</p> },
  { title: "Contact", body: <p>Say hello.</p> },
]

const group = {
  label: "QQ group",
  number: "1091411026",
  copyLabel: "Copy",
  copiedLabel: "Copied",
}

/** Replace the Clipboard API for one test; jsdom's own support is unreliable. */
function stubClipboard(writeText: ((s: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: writeText ? { writeText } : undefined,
    configurable: true,
    writable: true,
  })
}

describe("SiteInfoPanel", () => {
  it("renders every section title and body", () => {
    stubClipboard(undefined)
    const { getByText } = render(<SiteInfoPanel sections={sections} />)
    expect(getByText("About")).toBeTruthy()
    expect(getByText("An unofficial fan site.")).toBeTruthy()
    expect(getByText("Contact")).toBeTruthy()
    expect(getByText("Say hello.")).toBeTruthy()
  })

  it("omits the feedback card when no group is given", () => {
    stubClipboard(undefined)
    const { queryByTestId } = render(<SiteInfoPanel sections={sections} />)
    expect(queryByTestId("site-info-group-number")).toBeNull()
    expect(queryByTestId("site-info-copy")).toBeNull()
  })

  it("shows the group number when a group is given", () => {
    stubClipboard(undefined)
    const { getByTestId } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    expect(getByTestId("site-info-group-number").textContent).toBe("1091411026")
  })

  it("hides the copy button when the Clipboard API is unavailable", () => {
    stubClipboard(undefined)
    const { queryByTestId, getByTestId } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    // The number is still there to select by hand — only the button is gone.
    expect(getByTestId("site-info-group-number")).toBeTruthy()
    expect(queryByTestId("site-info-copy")).toBeNull()
  })

  it("copies the number and swaps the button label", async () => {
    const writeText = vi.fn<(s: string) => Promise<void>>(() => Promise.resolve())
    stubClipboard(writeText)
    const { getByTestId } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    const button = getByTestId("site-info-copy")
    expect(button.textContent).toContain("Copy")
    fireEvent.click(button)
    expect(writeText).toHaveBeenCalledWith("1091411026")
    await waitFor(() => expect(getByTestId("site-info-copy").textContent).toContain("Copied"))
  })

  it("does not claim success when the clipboard write is rejected", async () => {
    const writeText = vi.fn<(s: string) => Promise<void>>(() => Promise.reject(new Error("denied")))
    stubClipboard(writeText)
    const { getByTestId } = render(
      <SiteInfoPanel sections={sections} feedbackGroup={group} />,
    )
    fireEvent.click(getByTestId("site-info-copy"))
    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(getByTestId("site-info-copy").textContent).toContain("Copy")
    expect(getByTestId("site-info-copy").textContent).not.toContain("Copied")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd E:/arkive-games/arkive/frontend && pnpm test SiteInfoPanel
```

Expected: FAIL — `Failed to resolve import "./SiteInfoPanel"`.

- [ ] **Step 3: Write the implementation**

Create `packages/map-shell/src/SiteInfoPanel.tsx`:

```tsx
import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Check, Copy } from "lucide-react"
import { Button, cn } from "@gamemap/ui"

export interface SiteInfoSection {
  /** Optional heading rendered above the body. */
  title?: string
  /** Already-rendered body — markdown in aion2, plain elements in palworld. */
  body: ReactNode
}

export interface SiteInfoFeedbackGroup {
  /** Channel label, e.g. "QQ group". */
  label: string
  /** Group number, shown verbatim and copied to the clipboard. */
  number: string
  copyLabel: string
  copiedLabel: string
}

export interface SiteInfoPanelProps {
  sections: SiteInfoSection[]
  /** Omit to hide the card entirely — locales with no contact channel. */
  feedbackGroup?: SiteInfoFeedbackGroup
  className?: string
}

/**
 * Site information and feedback content, rendered identically in a right
 * sidebar, a top-bar popover and a mobile sheet. Every string arrives as a
 * prop, so this package needs no translation layer; bodies arrive rendered,
 * so it needs no markdown dependency either.
 *
 * Headings are plain divs, matching the surrounding apps' chrome, so adding
 * this panel cannot disturb heading-role assertions in existing tests.
 */
export function SiteInfoPanel({ sections, feedbackGroup, className }: SiteInfoPanelProps) {
  // Probed after mount rather than at render: on an insecure origin or an old
  // browser there is no Clipboard API, and a button that silently does nothing
  // is worse than no button. The number stays selectable either way.
  const [canCopy, setCanCopy] = useState(false)
  useEffect(() => {
    setCanCopy(typeof navigator.clipboard?.writeText === "function")
  }, [])

  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const number = feedbackGroup?.number
  const copy = useCallback(async () => {
    if (!number) return
    try {
      await navigator.clipboard.writeText(number)
      setCopied(true)
    } catch {
      // Clipboard blocked by permissions — leave the label alone so the UI
      // does not claim a copy that never happened.
    }
  }, [number])

  return (
    <div data-testid="site-info-panel" className={cn("flex flex-col gap-4", className)}>
      {sections.map((section, i) => (
        <div key={section.title ?? i} className="flex flex-col gap-1">
          {section.title && (
            <div className="text-sm font-semibold text-foreground">{section.title}</div>
          )}
          <div className="text-xs leading-relaxed break-words text-muted-foreground [&_a]:text-primary [&_a]:underline">
            {section.body}
          </div>
        </div>
      ))}

      {feedbackGroup && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{feedbackGroup.label}</div>
            <div
              data-testid="site-info-group-number"
              className="truncate font-mono text-sm text-foreground select-all"
            >
              {feedbackGroup.number}
            </div>
          </div>
          {canCopy && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="site-info-copy"
              onClick={() => void copy()}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? feedbackGroup.copiedLabel : feedbackGroup.copyLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Export it**

In `packages/map-shell/src/index.ts`, add after the existing `ShellSidebar` export line:

```ts
export { SiteInfoPanel } from "./SiteInfoPanel"
export type { SiteInfoPanelProps, SiteInfoSection, SiteInfoFeedbackGroup } from "./SiteInfoPanel"
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd E:/arkive-games/arkive/frontend && pnpm test SiteInfoPanel
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Verify the package stays clean**

```bash
cd E:/arkive-games/arkive/frontend && pnpm check:shell && pnpm --filter @gamemap/map-shell check
```

Expected: no grep output, exit 0; `tsc --noEmit` reports no errors.

- [ ] **Step 7: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/packages/map-shell/src/SiteInfoPanel.tsx frontend/packages/map-shell/src/SiteInfoPanel.test.tsx frontend/packages/map-shell/src/index.ts
git commit -m "feat(map-shell): add SiteInfoPanel for site info and feedback"
```

---

## Task 2: `ShellSidebar` side prop + `ShellLayout` right slot

**Files:**
- Create: `packages/map-shell/src/ShellSidebar.test.tsx`
- Modify: `packages/map-shell/src/ShellSidebar.tsx:92-106`
- Modify: `packages/map-shell/src/ShellLayout.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/map-shell/src/ShellSidebar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ShellSidebar } from "./ShellSidebar"

afterEach(cleanup)

const labels = { collapseLabel: "Collapse", expandLabel: "Expand" }

describe("ShellSidebar", () => {
  it("defaults to the left side and keeps the original toggle testid", () => {
    const { getByTestId, queryByTestId } = render(<ShellSidebar {...labels} />)
    expect(getByTestId("sidebar-toggle")).toBeTruthy()
    expect(queryByTestId("sidebar-toggle-right")).toBeNull()
  })

  it("uses a distinct toggle testid on the right so left selectors stay unique", () => {
    const { getByTestId, queryByTestId } = render(<ShellSidebar {...labels} side="right" />)
    expect(getByTestId("sidebar-toggle-right")).toBeTruthy()
    expect(queryByTestId("sidebar-toggle")).toBeNull()
  })

  it("hangs the toggle off the left edge when on the right", () => {
    const { getByTestId } = render(<ShellSidebar {...labels} side="right" />)
    const cls = getByTestId("sidebar-toggle-right").className
    expect(cls).toContain("left-0")
    expect(cls).toContain("-translate-x-full")
    expect(cls).not.toContain("right-0")
  })

  it("reports collapse changes on the right side too", () => {
    const onCollapsedChange = vi.fn()
    const { getByTestId } = render(
      <ShellSidebar {...labels} side="right" onCollapsedChange={onCollapsedChange} />,
    )
    fireEvent.click(getByTestId("sidebar-toggle-right"))
    expect(onCollapsedChange).toHaveBeenCalledWith(true)
  })

  it("renders children on the right side", () => {
    const { getByText } = render(
      <ShellSidebar {...labels} side="right">
        <p>Panel body</p>
      </ShellSidebar>,
    )
    expect(getByText("Panel body")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd E:/arkive-games/arkive/frontend && pnpm test ShellSidebar
```

Expected: FAIL — the `side` prop does not exist (TS error) and `sidebar-toggle-right` is not found.

- [ ] **Step 3: Add the `side` prop**

In `packages/map-shell/src/ShellSidebar.tsx`, add to `ShellSidebarProps` (after `width?: number` on line 6):

```ts
  /**
   * Which edge the sidebar sits on. Only the collapse toggle differs: it hangs
   * off the outward edge and its chevron points away from the content.
   */
  side?: "left" | "right"
```

Add `side = "left",` to the destructured parameters (after `width = 346,`).

Replace the toggle button block (currently lines 92-106) with:

```tsx
      <button
        type="button"
        data-testid={side === "right" ? "sidebar-toggle-right" : "sidebar-toggle"}
        onClick={toggle}
        aria-label={collapsed ? expandLabel : collapseLabel}
        className={cn(
          "absolute top-[100px] z-[20000] flex h-12 w-8 select-none flex-col items-center justify-center",
          side === "right"
            ? "left-0 -translate-x-full rounded-l-md rounded-r-none"
            : "right-0 translate-x-full rounded-r-md rounded-l-none",
          classNames?.collapseButton,
        )}
      >
        {(side === "right" ? !collapsed : collapsed) ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
        <span className="mt-0.5 whitespace-normal px-0.5 text-center text-xs leading-tight">
          {collapsed ? expandLabel : collapseLabel}
        </span>
      </button>
```

The chevron always points the direction the panel will move: on the left, collapsed means "expand rightwards"; on the right, expanded means "collapse rightwards".

- [ ] **Step 4: Add the `rightSidebar` slot**

In `packages/map-shell/src/ShellLayout.tsx`, add to `ShellLayoutProps` after `sidebar`:

```ts
  /** Optional second sidebar on the right, below the top bar. */
  rightSidebar?: ReactNode
```

Destructure it and render it after the content column:

```tsx
export function ShellLayout({ sidebar, rightSidebar, topBar, children, className }: ShellLayoutProps) {
  return (
    <div className={cn("flex h-dvh w-screen flex-col overflow-hidden", className)}>
      {topBar}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
        {rightSidebar}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd E:/arkive-games/arkive/frontend && pnpm test ShellSidebar
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Verify nothing else broke**

```bash
cd E:/arkive-games/arkive/frontend && pnpm test && pnpm check:shell && pnpm --filter @gamemap/map-shell check
```

Expected: all suites pass, no grep output, no TS errors.

- [ ] **Step 7: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/packages/map-shell/src/ShellSidebar.tsx frontend/packages/map-shell/src/ShellSidebar.test.tsx frontend/packages/map-shell/src/ShellLayout.tsx
git commit -m "feat(map-shell): support a right-hand sidebar in ShellSidebar and ShellLayout"
```

---

## Task 3: aion2 locale keys

Rename the legacy `rightSidebar` group (named after a sidebar deleted in `c470d62`) to `siteInfo`, add the new keys, and drop two dead subkeys. Four files.

**Files:**
- Modify: `apps/aion2/public/locales/zh-CN/common.yaml`
- Modify: `apps/aion2/public/locales/zh-TW/common.yaml`
- Modify: `apps/aion2/public/locales/en-US/common.yaml`
- Modify: `apps/aion2/public/locales/ko-KR/common.yaml`
- Modify: `apps/aion2/src/components/TopNavbar.tsx:107,111`
- Modify: `apps/aion2/src/components/BottomTabBar.tsx:207,211`

- [ ] **Step 1: Confirm the two dead subkeys really are dead**

```bash
cd E:/arkive-games/arkive/frontend && grep -rn "rightSidebar.members\|rightSidebar.donation" --include=*.ts --include=*.tsx apps/ packages/
```

Expected: **no output.** If anything prints, stop and keep those keys instead of removing them.

- [ ] **Step 2: Rewrite the zh-CN block**

In `apps/aion2/public/locales/zh-CN/common.yaml`, replace the whole `rightSidebar:` block (currently `members` / `contact` / `donation`) with:

```yaml
siteInfo:
  tab: "关于"
  title: "关于本站"
  body: |-
    本站是由 **苏烟攻略组** 搭建与维护的《永恒之塔 2》非官方互动地图与资料库，游戏数据均从游戏文件中提取，永久免费开放。

    本站与 NCSOFT 无隶属关系，也未获其授权或背书。
  contact:
    title: "交流与联系方式"
    content: |
      1. 永恒之塔 2 交流群：  
         ①群 246681864  
         ②群 197791140  
         ③群 791286881  
  feedback:
    label: "反馈 QQ 群"
    hint: "欢迎加入反馈群提出建议、反馈问题或报告 bug。"
  copy: "复制"
  copied: "已复制"
```

The three game-discussion groups stay as prose; the new feedback group is separate because it serves a different purpose.

- [ ] **Step 3: Add the zh-TW block**

`apps/aion2/public/locales/zh-TW/common.yaml` has **no** `rightSidebar` block at all, so this is new content. Append at the end of the file:

```yaml
siteInfo:
  tab: "關於"
  title: "關於本站"
  body: |-
    本站是由 **蘇煙攻略組** 搭建與維護的《永恆之塔 2》非官方互動地圖與資料庫，遊戲資料均自遊戲檔案中擷取，永久免費開放。

    本站與 NCSOFT 無隸屬關係，也未獲其授權或背書。
  contact:
    title: "交流與聯絡方式"
    content: |
      1. 永恆之塔 2 交流群：  
         ①群 246681864  
         ②群 197791140  
         ③群 791286881  
  feedback:
    label: "回饋 QQ 群"
    hint: "歡迎加入回饋群提出建議、回報問題或回報 bug。"
  copy: "複製"
  copied: "已複製"
```

- [ ] **Step 4: Rewrite the en-US block**

In `apps/aion2/public/locales/en-US/common.yaml`, replace the whole `rightSidebar:` block with (the Discord invites are preserved verbatim — they are the English-speaking users' only channel):

```yaml
siteInfo:
  tab: "About"
  title: "About this site"
  body: |-
    An unofficial, fan-made interactive map and database for AION2, built and maintained by the 苏烟攻略组 (Suyn AION2 Team). All game data is extracted from the game files, and the site is free to use.

    Not affiliated with, endorsed by, or sponsored by NCSOFT.
  contact:
    title: "Communication & Contact"
    content: |
      1. **Our Aion 2 Discussion Discord:** https://discord.gg/cqn9sKbWPU
      2. For the latest Aion 2 news and active discussions, check out the Aion 2 Global Discord – **the biggest Aion 2's community** we’re happy to collaborate with: https://discord.gg/aion2global
  copy: "Copy"
  copied: "Copied"
```

No `feedback:` key here — the QQ group is Chinese-locale only.

- [ ] **Step 5: Rewrite the ko-KR block**

In `apps/aion2/public/locales/ko-KR/common.yaml`, replace the whole `rightSidebar:` block with:

```yaml
siteInfo:
  tab: "소개"
  title: "사이트 소개"
  body: |-
    苏烟攻略组 (Suyn AION2 Team)이 제작하고 운영하는 아이온2 비공식 인터랙티브 지도 및 데이터베이스입니다. 모든 게임 데이터는 게임 파일에서 추출했으며, 무료로 이용할 수 있습니다.

    NCSOFT와 제휴 관계가 없으며, NCSOFT의 승인이나 후원을 받지 않았습니다.
  contact:
    title: "소통 & 문의"
    content: |
      1. **저희 Aion 2 토론 Discord:** https://discord.gg/cqn9sKbWPU
      2. 최신 Aion 2 소식과 활발한 토론은 Aion 2 Global Discord에서 확인하세요 — 저희가 기꺼이 협력하는 **최대 규모의 Aion 2 커뮤니티**입니다: https://discord.gg/aion2global
  copy: "복사"
  copied: "복사됨"
```

- [ ] **Step 6: Point the two existing call sites at the new key names**

In `apps/aion2/src/components/TopNavbar.tsx`, change lines 107 and 111:

```tsx
                {t("common:siteInfo.contact.title", "Communication & Contact")}
```
```tsx
                  {t("common:siteInfo.contact.content")}
```

In `apps/aion2/src/components/BottomTabBar.tsx`, change lines 207 and 211 the same way:

```tsx
              {t("common:siteInfo.contact.title", "Communication & Contact")}
```
```tsx
                {t("common:siteInfo.contact.content")}
```

- [ ] **Step 7: Verify no stale references remain**

```bash
cd E:/arkive-games/arkive/frontend && grep -rn "rightSidebar" --include=*.ts --include=*.tsx --include=*.yaml apps/ packages/
```

Expected: **no output.**

- [ ] **Step 8: Verify the app still builds and the YAML parses**

```bash
cd E:/arkive-games/arkive/frontend && pnpm --filter aion2 exec tsc --noEmit -p tsconfig.app.json && node -e "const y=require('js-yaml');" 2>/dev/null; for f in zh-CN zh-TW en-US ko-KR; do node --input-type=module -e "
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'
const d = parse(readFileSync('apps/aion2/public/locales/$f/common.yaml','utf8'))
if (!d.siteInfo?.title) throw new Error('$f: siteInfo.title missing')
if (d.rightSidebar) throw new Error('$f: rightSidebar still present')
console.log('$f ok', Object.keys(d.siteInfo).join(','))
"; done
```

Expected: four `… ok tab,title,body,contact,…` lines, no throw. (`yaml` is already a dependency of aion2 — run this from `frontend/`.)

- [ ] **Step 9: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/apps/aion2/public/locales/zh-CN/common.yaml frontend/apps/aion2/public/locales/zh-TW/common.yaml frontend/apps/aion2/public/locales/en-US/common.yaml frontend/apps/aion2/public/locales/ko-KR/common.yaml frontend/apps/aion2/src/components/TopNavbar.tsx frontend/apps/aion2/src/components/BottomTabBar.tsx
git commit -m "refactor(aion2): rename rightSidebar locale keys to siteInfo and add site-info text"
```

---

## Task 4: aion2 `SiteInfo` adapter + popover and More-sheet hosts

**Files:**
- Create: `apps/aion2/src/components/SiteInfo.tsx`
- Modify: `apps/aion2/src/components/TopNavbar.tsx:102-114`
- Modify: `apps/aion2/src/components/BottomTabBar.tsx:205-213`

- [ ] **Step 1: Create the adapter**

Create `apps/aion2/src/components/SiteInfo.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SiteInfoPanel, type SiteInfoSection } from "@gamemap/map-shell";

/**
 * Feedback / suggestions / bug-report group, shared by both sites. Kept in
 * code rather than the locale files: a group number is not a translation.
 */
export const FEEDBACK_QQ_GROUP = "1091411026";

/** Renders one locale value as GitHub-flavoured markdown. */
function Body({ children }: { children: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

/**
 * Site information and feedback, rendered in three places: the map's right
 * sidebar, the top-bar popover and the mobile More sheet. The QQ group only
 * appears for Chinese locales — the other locales carry their own channel in
 * `siteInfo.contact.content` (Discord for en-US / ko-KR).
 */
export default function SiteInfo({ className }: { className?: string }) {
  const { t, i18n } = useTranslation(["common"]);
  const isZh = (i18n.resolvedLanguage ?? i18n.language ?? "").startsWith("zh");

  const sections: SiteInfoSection[] = [
    {
      title: t("common:siteInfo.title", "About this site"),
      body: <Body>{t("common:siteInfo.body")}</Body>,
    },
  ];

  const contactContent = t("common:siteInfo.contact.content", "");
  const feedbackHint = isZh ? t("common:siteInfo.feedback.hint", "") : "";
  if (contactContent || feedbackHint) {
    sections.push({
      title: t("common:siteInfo.contact.title", "Communication & Contact"),
      body: (
        <>
          {contactContent && <Body>{contactContent}</Body>}
          {/* Also through <Body>: a bare <p> would inherit the panel's text-xs
              while the markdown above renders at prose-sm, putting two
              adjacent paragraphs in one section at two different sizes. */}
          {feedbackHint && <Body>{feedbackHint}</Body>}
        </>
      ),
    });
  }

  return (
    <SiteInfoPanel
      className={className}
      sections={sections}
      feedbackGroup={
        isZh
          ? {
              label: t("common:siteInfo.feedback.label", "QQ"),
              number: FEEDBACK_QQ_GROUP,
              // Generic UI verbs live in the shared `ui` group, not `siteInfo`.
              copyLabel: t("common:ui.copy", "Copy"),
              copiedLabel: t("common:ui.copied", "Copied"),
            }
          : undefined
      }
    />
  );
}
```

- [ ] **Step 2: Swap the top-bar popover body**

In `apps/aion2/src/components/TopNavbar.tsx`, replace the `PopoverContent` block (lines 102-114) with:

```tsx
            <PopoverContent
              align="end"
              className="max-h-[70vh] w-[300px] overflow-y-auto"
            >
              <SiteInfo />
            </PopoverContent>
```

Add the import `import SiteInfo from "@/components/SiteInfo";` and remove the now-unused `ReactMarkdown` and `remarkGfm` imports (lines 4-5) **only if nothing else in the file uses them** — check with `grep -n "ReactMarkdown\|remarkGfm" apps/aion2/src/components/TopNavbar.tsx` first.

- [ ] **Step 3: Swap the mobile More-sheet section**

In `apps/aion2/src/components/BottomTabBar.tsx`, replace the contact block (lines 205-213 — the `div` holding the title and the `ReactMarkdown`) with:

```tsx
          <div className="mt-3 border-t border-border pt-3">
            <SiteInfo />
          </div>
```

Keep the archive link that follows it. Add `import SiteInfo from "@/components/SiteInfo";`, and remove `ReactMarkdown` / `remarkGfm` imports if this file no longer uses them (check with grep as above).

- [ ] **Step 4: Verify types and lint**

```bash
cd E:/arkive-games/arkive/frontend && pnpm --filter aion2 exec tsc --noEmit -p tsconfig.app.json && pnpm lint:aion2
```

Expected: no errors. Unused-import errors here mean step 2 or 3 left a dead import — remove it.

- [ ] **Step 5: Note the deferred browser check**

*Deferred to the post-merge live-test pass (Task 10, Step 5).* What to look at then, at `http://localhost:15173/?lng=zh-CN`: click the mail icon in the top bar and confirm the About section, the three discussion groups, the feedback hint, and a `1091411026` card with a working 复制 button; then `?lng=en-US` and confirm the card is gone while the Discord links remain. Do not start a dev server in the worktree — port `15173` belongs to the main workspace.

- [ ] **Step 6: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/apps/aion2/src/components/SiteInfo.tsx frontend/apps/aion2/src/components/TopNavbar.tsx frontend/apps/aion2/src/components/BottomTabBar.tsx
git commit -m "feat(aion2): render site info through SiteInfoPanel in the top bar and More sheet"
```

---

## Task 5: aion2 right sidebar

**Files:**
- Create: `apps/aion2/src/features/map/sidebar/InfoSidebar.tsx`
- Modify: `apps/aion2/src/features/map/MapRoute.tsx:439-450`

- [ ] **Step 1: Create the sidebar**

Create `apps/aion2/src/features/map/sidebar/InfoSidebar.tsx`:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShellSidebar } from "@gamemap/map-shell";
import SiteInfo from "@/components/SiteInfo";

const COLLAPSED_KEY = "aion2.siteInfoSidebarCollapsed";

/**
 * Expanded on a first-ever visit so the feedback invite is actually seen, then
 * the visitor's own choice wins forever. Storage lives here rather than in the
 * shell package, which must stay storage-free.
 */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* no storage */
  }
}

export default function InfoSidebar() {
  const { t } = useTranslation(["common"]);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const label = t("common:siteInfo.tab", "About");

  return (
    <ShellSidebar
      side="right"
      width={320}
      collapsed={collapsed}
      onCollapsedChange={(next) => {
        setCollapsed(next);
        writeCollapsed(next);
      }}
      // The tab names what it opens rather than saying "Collapse"/"Expand",
      // which is all a visitor needs to decide whether to click it.
      collapseLabel={label}
      expandLabel={label}
      // Names the <aside> landmark, so screen-reader landmark navigation can
      // tell this sidebar apart from the filter sidebar on the same page.
      label={label}
      classNames={{
        root: "border-l border-border bg-card text-card-foreground",
        collapseButton: "text-[#3D3D3D] bg-[color:var(--color-sidebar-collapse)]",
        content: "px-3 pt-3",
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  );
}
```

- [ ] **Step 2: Mount it**

In `apps/aion2/src/features/map/MapRoute.tsx`, add `import InfoSidebar from "./sidebar/InfoSidebar";` beside the existing `Sidebar` import, then add the prop to the desktop `ShellLayout` (line 440):

```tsx
    <ShellLayout
      className="bg-background text-foreground"
      topBar={<TopNavbar />}
      sidebar={<Sidebar />}
      rightSidebar={<InfoSidebar />}
    >
```

The mobile branch returns earlier (line 356), so phones are unaffected.

- [ ] **Step 3: Verify types and lint**

```bash
cd E:/arkive-games/arkive/frontend && pnpm --filter aion2 exec tsc --noEmit -p tsconfig.app.json && pnpm lint:aion2
```

Expected: no errors.

- [ ] **Step 4: Note the deferred browser check**

*Deferred to the post-merge live-test pass (Task 10, Step 5).* What to look at then, at `http://localhost:15173/?lng=zh-CN`: the panel is open on the right on a first visit (`localStorage.removeItem('aion2.siteInfoSidebarCollapsed')` then reload to retest), the tab on its left edge collapses it, the map redraws and fills the freed space without blank tiles, and the collapsed state survives a reload.

- [ ] **Step 5: Bump the aion2 version**

This commit completes aion2's user-visible feature, so it carries the release entry.

```bash
cd E:/arkive-games/arkive/frontend
pnpm changelog:add --app aion2 --bump minor --kind feature \
  --en "New site info panel: what this site is, plus a channel for feedback and bug reports — in a right sidebar on the map, and from the top bar on any page." \
  --zh-cn "新增站点信息面板：介绍本站并提供反馈交流渠道（QQ 群 1091411026），可在地图右侧栏或顶栏随时打开。" \
  --zh-tw "新增站點資訊面板：介紹本站並提供回饋交流管道（QQ 群 1091411026），可在地圖右側欄或頂欄隨時開啟。"
```

Expected: `apps/aion2/src/changelog.json` gains a `1.7.0` entry at the top. Verify with:

```bash
cd E:/arkive-games/arkive/frontend && pnpm test changelog
```

Expected: PASS. A failure here means the version, date ordering or locale coverage is wrong — fix the JSON, do not skip the test.

- [ ] **Step 6: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/apps/aion2/src/features/map/sidebar/InfoSidebar.tsx frontend/apps/aion2/src/features/map/MapRoute.tsx frontend/apps/aion2/src/changelog.json
git commit -m "feat(aion2): add the site-info right sidebar to the desktop map (1.7.0)"
```

---

## Task 6: palworld locale strings

**Files:**
- Create: `apps/palworld/src/siteInfoStrings.ts`
- Modify: `apps/palworld/src/i18n.ts` (import block near line 4-16, merge block near line 938)

- [ ] **Step 1: Create the strings table**

`Record<Language, SiteInfoStrings>` makes a missing locale a type error, so all 17 must be present. `contact` is optional and appears only for Chinese locales.

Create `apps/palworld/src/siteInfoStrings.ts`:

```ts
import type { Language } from './i18n'

// Site-info / feedback strings, merged into the `translation` namespace under a
// `siteInfo` key (see i18n.ts). `contact` is present only for locales that have
// a real channel to point at — the QQ group is Chinese-only, so the other
// locales render the intro and disclaimer alone.
export interface SiteInfoStrings {
  /** Right-sidebar toggle tab text; also the popover's aria-label. */
  tab: string
  /** Heading of the intro section. */
  title: string
  /** One paragraph per entry: what the site is, then the disclaimer. */
  body: string[]
  contact?: {
    title: string
    hint: string
    /** Label above the group number, e.g. "QQ 群". */
    groupLabel: string
  }
  copy: string
  copied: string
}

const DISCLAIMER_EN = 'Not affiliated with, endorsed by, or sponsored by Pocketpair, Inc.'

export const SITE_INFO_STRINGS: Record<Language, SiteInfoStrings> = {
  'en-US': {
    tab: 'About',
    title: 'About this site',
    body: [
      'An unofficial, fan-made interactive map and database for Palworld. All game data is extracted from the game files.',
      DISCLAIMER_EN,
    ],
    copy: 'Copy',
    copied: 'Copied',
  },
  'de-DE': {
    tab: 'Info',
    title: 'Über diese Seite',
    body: [
      'Eine unofficielle, von Fans erstellte interaktive Karte und Datenbank für Palworld. Alle Spieldaten stammen aus den Spieldateien.',
      'Nicht mit Pocketpair, Inc. verbunden und weder von ihnen unterstützt noch gesponsert.',
    ],
    copy: 'Kopieren',
    copied: 'Kopiert',
  },
  'es-ES': {
    tab: 'Acerca de',
    title: 'Acerca de este sitio',
    body: [
      'Un mapa interactivo y una base de datos de Palworld no oficiales, creados por aficionados. Todos los datos se extraen de los archivos del juego.',
      'Sin afiliación, respaldo ni patrocinio de Pocketpair, Inc.',
    ],
    copy: 'Copiar',
    copied: 'Copiado',
  },
  'es-MX': {
    tab: 'Acerca de',
    title: 'Acerca de este sitio',
    body: [
      'Un mapa interactivo y una base de datos de Palworld no oficiales, hechos por fans. Todos los datos se extraen de los archivos del juego.',
      'Sin afiliación, respaldo ni patrocinio de Pocketpair, Inc.',
    ],
    copy: 'Copiar',
    copied: 'Copiado',
  },
  'fr-FR': {
    tab: 'À propos',
    title: 'À propos de ce site',
    body: [
      'Une carte interactive et une base de données non officielles pour Palworld, réalisées par des fans. Toutes les données proviennent des fichiers du jeu.',
      'Sans lien avec Pocketpair, Inc., ni approuvé ni sponsorisé par elle.',
    ],
    copy: 'Copier',
    copied: 'Copié',
  },
  'id-ID': {
    tab: 'Tentang',
    title: 'Tentang situs ini',
    body: [
      'Peta interaktif dan basis data Palworld tidak resmi yang dibuat oleh penggemar. Semua data game diambil dari file game.',
      'Tidak berafiliasi, didukung, atau disponsori oleh Pocketpair, Inc.',
    ],
    copy: 'Salin',
    copied: 'Tersalin',
  },
  'it-IT': {
    tab: 'Informazioni',
    title: 'Informazioni sul sito',
    body: [
      'Una mappa interattiva e un database non ufficiali per Palworld, creati dai fan. Tutti i dati di gioco sono estratti dai file del gioco.',
      'Non affiliato, approvato o sponsorizzato da Pocketpair, Inc.',
    ],
    copy: 'Copia',
    copied: 'Copiato',
  },
  'ja-JP': {
    tab: 'このサイトについて',
    title: 'このサイトについて',
    body: [
      'ファンが制作した非公式のパルワールド インタラクティブマップ＆データベースです。ゲームデータはすべてゲームファイルから抽出しています。',
      'Pocketpair, Inc. とは一切関係がなく、承認や後援も受けていません。',
    ],
    copy: 'コピー',
    copied: 'コピーしました',
  },
  'ko-KR': {
    tab: '소개',
    title: '사이트 소개',
    body: [
      '팬이 제작한 비공식 팰월드 인터랙티브 지도 및 데이터베이스입니다. 모든 게임 데이터는 게임 파일에서 추출했습니다.',
      'Pocketpair, Inc.와 제휴 관계가 없으며, 승인이나 후원을 받지 않았습니다.',
    ],
    copy: '복사',
    copied: '복사됨',
  },
  'pl-PL': {
    tab: 'O stronie',
    title: 'O tej stronie',
    body: [
      'Nieoficjalna, stworzona przez fanów interaktywna mapa i baza danych do Palworld. Wszystkie dane pochodzą z plików gry.',
      'Niepowiązane z Pocketpair, Inc.; bez ich poparcia ani sponsoringu.',
    ],
    copy: 'Kopiuj',
    copied: 'Skopiowano',
  },
  'pt-BR': {
    tab: 'Sobre',
    title: 'Sobre este site',
    body: [
      'Um mapa interativo e banco de dados não oficiais de Palworld, feitos por fãs. Todos os dados do jogo são extraídos dos arquivos do jogo.',
      'Sem afiliação, endosso ou patrocínio da Pocketpair, Inc.',
    ],
    copy: 'Copiar',
    copied: 'Copiado',
  },
  'ru-RU': {
    tab: 'О сайте',
    title: 'О сайте',
    body: [
      'Неофициальная фанатская интерактивная карта и база данных по Palworld. Все игровые данные извлечены из файлов игры.',
      'Не связано с Pocketpair, Inc., не одобрено и не финансируется ею.',
    ],
    copy: 'Копировать',
    copied: 'Скопировано',
  },
  'th-TH': {
    tab: 'เกี่ยวกับ',
    title: 'เกี่ยวกับเว็บไซต์นี้',
    body: [
      'แผนที่แบบอินเทอร์แอกทีฟและฐานข้อมูล Palworld ที่แฟน ๆ ทำขึ้นอย่างไม่เป็นทางการ ข้อมูลเกมทั้งหมดดึงมาจากไฟล์เกม',
      'ไม่มีความเกี่ยวข้อง ไม่ได้รับการรับรอง และไม่ได้รับการสนับสนุนจาก Pocketpair, Inc.',
    ],
    copy: 'คัดลอก',
    copied: 'คัดลอกแล้ว',
  },
  'tr-TR': {
    tab: 'Hakkında',
    title: 'Bu site hakkında',
    body: [
      'Palworld için hayranlar tarafından yapılmış resmi olmayan etkileşimli harita ve veri tabanı. Tüm oyun verileri oyun dosyalarından çıkarılmıştır.',
      'Pocketpair, Inc. ile bağlantılı değildir; onaylanmamış ve desteklenmemiştir.',
    ],
    copy: 'Kopyala',
    copied: 'Kopyalandı',
  },
  'vi-VN': {
    tab: 'Giới thiệu',
    title: 'Giới thiệu về trang này',
    body: [
      'Bản đồ tương tác và cơ sở dữ liệu Palworld không chính thức do người hâm mộ thực hiện. Toàn bộ dữ liệu được trích xuất từ tệp của game.',
      'Không liên kết, không được Pocketpair, Inc. chứng thực hoặc tài trợ.',
    ],
    copy: 'Sao chép',
    copied: 'Đã sao chép',
  },
  'zh-CN': {
    tab: '关于',
    title: '关于本站',
    body: [
      '本站是由玩家制作的《幻兽帕鲁》非官方互动地图与资料库，所有游戏数据均从游戏文件中提取。',
      '本站与 Pocketpair, Inc. 无隶属关系，也未获其授权或赞助。',
    ],
    contact: {
      title: '交流与反馈',
      hint: '欢迎加入 QQ 群提出建议、反馈问题或报告 bug。',
      groupLabel: 'QQ 群',
    },
    copy: '复制',
    copied: '已复制',
  },
  'zh-TW': {
    tab: '關於',
    title: '關於本站',
    body: [
      '本站是由玩家製作的《幻獸帕魯》非官方互動地圖與資料庫，所有遊戲資料均自遊戲檔案中擷取。',
      '本站與 Pocketpair, Inc. 無隸屬關係，也未獲其授權或贊助。',
    ],
    contact: {
      title: '交流與回饋',
      hint: '歡迎加入 QQ 群提出建議、回報問題或回報 bug。',
      groupLabel: 'QQ 群',
    },
    copy: '複製',
    copied: '已複製',
  },
}
```

- [ ] **Step 2: Merge it into i18next**

In `apps/palworld/src/i18n.ts`, add to the import block (near lines 4-16):

```ts
import { SITE_INFO_STRINGS } from './siteInfoStrings'
```

Then inside the `for (const lng of LANGUAGES)` `addResourceBundle` object, add a line beside the other feature bundles (e.g. after `basecamp: …`):

```ts
      siteInfo: SITE_INFO_STRINGS[lng],
```

- [ ] **Step 3: Verify types**

```bash
cd E:/arkive-games/arkive/frontend && pnpm --filter palworld exec tsc --noEmit -p tsconfig.app.json
```

Expected: no errors. A `Property '<locale>' is missing` error means a locale was skipped — add it.

- [ ] **Step 4: Assert every locale really is populated**

```bash
cd E:/arkive-games/arkive/frontend && node --input-type=module -e "
import { readFileSync } from 'node:fs'
const src = readFileSync('apps/palworld/src/siteInfoStrings.ts','utf8')
const langs = ['en-US','de-DE','es-ES','es-MX','fr-FR','id-ID','it-IT','ja-JP','ko-KR','pl-PL','pt-BR','ru-RU','th-TH','tr-TR','vi-VN','zh-CN','zh-TW']
const missing = langs.filter((l) => !src.includes(\"'\" + l + \"': {\"))
if (missing.length) throw new Error('missing locales: ' + missing.join(', '))
const zhOnly = (src.match(/contact: \{/g) ?? []).length
if (zhOnly !== 2) throw new Error('expected exactly 2 contact blocks (zh-CN, zh-TW), found ' + zhOnly)
console.log('all 17 locales present; contact limited to 2')
"
```

Expected: `all 17 locales present; contact limited to 2`.

- [ ] **Step 5: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/apps/palworld/src/siteInfoStrings.ts frontend/apps/palworld/src/i18n.ts
git commit -m "feat(palworld): add 17-locale site-info strings"
```

---

## Task 7: palworld `SiteInfo` adapter + popover and More-sheet hosts

**Files:**
- Create: `apps/palworld/src/components/SiteInfo.tsx`
- Modify: `apps/palworld/src/components/TopNav.tsx:86-96`
- Modify: `apps/palworld/src/components/BottomTabBar.tsx:84-130`

- [ ] **Step 1: Create the adapter**

palworld has no `react-markdown`, so bodies are plain paragraphs.

Create `apps/palworld/src/components/SiteInfo.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { SiteInfoPanel, type SiteInfoSection } from '@gamemap/map-shell'

/**
 * Feedback / suggestions / bug-report group, shared by both sites. Kept in
 * code rather than the locale tables: a group number is not a translation.
 */
export const FEEDBACK_QQ_GROUP = '1091411026'

function Paragraphs({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line) => (
        <p key={line} className="mb-1 last:mb-0">
          {line}
        </p>
      ))}
    </>
  )
}

/**
 * Site information and feedback, rendered in the map's right sidebar, the
 * top-bar popover and the mobile More sheet. The contact section exists only
 * for locales that have a channel — currently zh-CN and zh-TW.
 */
export function SiteInfo({ className }: { className?: string }) {
  const { t } = useTranslation()
  const body = t('siteInfo.body', { returnObjects: true }) as string[]
  const contactTitle = t('siteInfo.contact.title', { defaultValue: '' })
  const contactHint = t('siteInfo.contact.hint', { defaultValue: '' })
  const groupLabel = t('siteInfo.contact.groupLabel', { defaultValue: '' })

  const sections: SiteInfoSection[] = [
    {
      title: t('siteInfo.title'),
      body: <Paragraphs lines={Array.isArray(body) ? body : [String(body)]} />,
    },
  ]
  if (contactTitle && contactHint) {
    sections.push({ title: contactTitle, body: <p>{contactHint}</p> })
  }

  return (
    <SiteInfoPanel
      className={className}
      sections={sections}
      feedbackGroup={
        groupLabel
          ? {
              label: groupLabel,
              number: FEEDBACK_QQ_GROUP,
              copyLabel: t('siteInfo.copy'),
              copiedLabel: t('siteInfo.copied'),
            }
          : undefined
      }
    />
  )
}
```

The presence of `siteInfo.contact.groupLabel` is itself the locale gate — only zh-CN and zh-TW define `contact`, and `fallbackLng: 'en-US'` cannot supply it because en-US has no `contact` either.

- [ ] **Step 2: Add the top-bar popover**

In `apps/palworld/src/components/TopNav.tsx`, extend the imports:

```ts
import { Info } from 'lucide-react'
import { BuildInfo, Button, Popover, PopoverContent, PopoverTrigger } from '@gamemap/ui'
import { SiteInfo } from './SiteInfo'
```

Then replace the `rightExtras` fragment (lines 86-96) with:

```tsx
      rightExtras={
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="contact-menu"
                aria-label={t('siteInfo.tab')}
                title={t('siteInfo.tab')}
              >
                <Info className="size-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-[70vh] w-[320px] overflow-y-auto">
              <SiteInfo />
            </PopoverContent>
          </Popover>
          <ThemeToggle labels={{ auto: t('themeAuto'), light: t('themeLight'), dark: t('themeDark') }} />
          <BuildInfo
            commit={__BUILD_GIT_COMMIT__}
            buildTime={__BUILD_TIME__}
            dev={import.meta.env.DEV}
            gameVersion={getGameVersion()}
          />
        </>
      }
```

- [ ] **Step 3: Add the More-sheet section**

In `apps/palworld/src/components/BottomTabBar.tsx`, add `import { SiteInfo } from './SiteInfo'`. The sheet currently has no height cap, and this content is long enough to need one — change the `SheetContent` (line 85-89) to:

```tsx
        <SheetContent
          side="bottom"
          data-testid="more-sheet"
          className="max-h-[85dvh] overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        >
```

Then add a section after the language/theme row (after the `</div>` that closes the block at line 128), before `</SheetContent>`:

```tsx
          <div className="mt-3 border-t border-border pt-3">
            <SiteInfo />
          </div>
```

- [ ] **Step 4: Verify types and lint**

```bash
cd E:/arkive-games/arkive/frontend && pnpm --filter palworld exec tsc --noEmit -p tsconfig.app.json && pnpm lint:palworld
```

Expected: no errors.

- [ ] **Step 5: Note the deferred browser check**

*Deferred to the post-merge live-test pass (Task 10, Step 5).* What to look at then, at `http://localhost:15174/pals`: click the info icon — About + disclaimer, no QQ card in English; switch to 简体中文 via the language menu and confirm the 交流与反馈 section and the `1091411026` card with a working 复制 button; then narrow the window below 768px and check the More sheet shows the same section and scrolls.

- [ ] **Step 6: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/apps/palworld/src/components/SiteInfo.tsx frontend/apps/palworld/src/components/TopNav.tsx frontend/apps/palworld/src/components/BottomTabBar.tsx
git commit -m "feat(palworld): add the site-info popover and More-sheet section"
```

---

## Task 8: palworld right sidebar

**Files:**
- Create: `apps/palworld/src/components/InfoSidebar.tsx`
- Modify: `apps/palworld/src/App.tsx:823-861`

- [ ] **Step 1: Create the sidebar**

Create `apps/palworld/src/components/InfoSidebar.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShellSidebar } from '@gamemap/map-shell'
import { SiteInfo } from './SiteInfo'

const COLLAPSED_KEY = 'palworld.siteInfoSidebarCollapsed'

/**
 * Expanded on a first-ever visit so the feedback invite is actually seen, then
 * the visitor's own choice wins forever. Storage lives here rather than in the
 * shell package, which must stay storage-free.
 */
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* no storage */
  }
}

export function InfoSidebar() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const label = t('siteInfo.tab')

  return (
    <ShellSidebar
      side="right"
      width={320}
      collapsed={collapsed}
      onCollapsedChange={(next) => {
        setCollapsed(next)
        writeCollapsed(next)
      }}
      // The tab names what it opens rather than saying "Collapse"/"Expand".
      collapseLabel={label}
      expandLabel={label}
      // Names the <aside> landmark, so screen-reader landmark navigation can
      // tell this sidebar apart from the filter sidebar on the same page.
      label={label}
      classNames={{
        root: 'border-l border-border bg-gradient-to-b from-card to-background text-sm text-card-foreground',
        collapseButton: 'bg-secondary text-secondary-foreground',
        content: 'px-3 pt-3',
      }}
    >
      <SiteInfo />
    </ShellSidebar>
  )
}
```

- [ ] **Step 2: Mount it**

In `apps/palworld/src/App.tsx`, add `import { InfoSidebar } from './components/InfoSidebar'` beside the other component imports, then add the prop to the desktop `ShellLayout` (line 826) — after the closing `}` of the `sidebar` prop and before the children:

```tsx
      rightSidebar={<InfoSidebar />}
```

The mobile branch returns at line 773, so phones are unaffected.

- [ ] **Step 3: Verify types and lint**

```bash
cd E:/arkive-games/arkive/frontend && pnpm --filter palworld exec tsc --noEmit -p tsconfig.app.json && pnpm lint:palworld
```

Expected: no errors.

- [ ] **Step 4: Note the deferred browser check**

*Deferred to the post-merge live-test pass (Task 10, Step 5).* What to look at then, at `http://localhost:15174/`: the panel is open on the right on a first visit (`localStorage.removeItem('palworld.siteInfoSidebarCollapsed')` then reload to retest), the left-edge tab collapses it, the Leaflet map fills the freed width with no blank tiles, and the state survives a reload. Also confirm the left filter sidebar's tab still works and the two tabs do not overlap.

- [ ] **Step 5: Bump the palworld version**

This commit completes palworld's user-visible feature, so it carries the release entry.

```bash
cd E:/arkive-games/arkive/frontend
pnpm changelog:add --app palworld --bump minor --kind feature \
  --en "New site info panel: what this site is, plus a channel for feedback and bug reports — in a right sidebar on the map, and from the top bar on any page." \
  --zh-cn "新增站点信息面板：介绍本站并提供反馈交流渠道（QQ 群 1091411026），可在地图右侧栏或顶栏随时打开。" \
  --zh-tw "新增站點資訊面板：介紹本站並提供回饋交流管道（QQ 群 1091411026），可在地圖右側欄或頂欄隨時開啟。"
```

Expected: `apps/palworld/src/changelog.json` gains a `1.9.0` entry at the top. Verify with:

```bash
cd E:/arkive-games/arkive/frontend && pnpm test changelog
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/apps/palworld/src/components/InfoSidebar.tsx frontend/apps/palworld/src/App.tsx frontend/apps/palworld/src/changelog.json
git commit -m "feat(palworld): add the site-info right sidebar to the desktop map (1.9.0)"
```

---

## Task 9: End-to-end tests

**Files:**
- Create: `apps/aion2/e2e/site-info.spec.ts`
- Create: `apps/palworld/e2e/site-info.spec.ts`

- [ ] **Step 1: Write the aion2 spec**

aion2 switches locale through the `?lng=` query parameter (the pattern `e2e/mobile.spec.ts` already uses).

Create `apps/aion2/e2e/site-info.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

const PHONE = { width: 390, height: 844 };
const QQ_GROUP = "1091411026";

test.describe("site info — desktop", () => {
  test("the right sidebar shows the feedback group in zh-CN", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    await expect(page.getByTestId("sidebar-toggle-right")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number").first()).toHaveText(QQ_GROUP);
  });

  test("no feedback group in en-US, but the contact section survives", async ({ page }) => {
    await page.goto("/?lng=en-US");
    await expect(page.getByTestId("site-info-panel").first()).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveCount(0);
    await expect(page.getByText("discord.gg/cqn9sKbWPU").first()).toBeVisible();
  });

  test("the left sidebar toggle is still unique", async ({ page }) => {
    await page.goto("/?lng=en-US");
    await expect(page.getByTestId("sidebar-toggle")).toHaveCount(1);
  });

  test("collapsing the right sidebar is remembered across reloads", async ({ page }) => {
    await page.goto("/?lng=zh-CN");
    const toggle = page.getByTestId("sidebar-toggle-right");
    await expect(page.getByTestId("site-info-group-number").first()).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId("site-info-group-number")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("sidebar-toggle-right")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveCount(0);
  });

  test("the top-bar popover carries the panel on a wiki page", async ({ page }) => {
    await page.goto("/wiki?lng=zh-CN");
    await page.getByTestId("contact-menu").click();
    await expect(page.getByTestId("site-info-panel")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
  });
});

test.describe("site info — phone", () => {
  test.use({ viewport: PHONE });

  test("the More sheet carries the panel and no right sidebar exists", async ({ page }) => {
    await page.goto("/wiki?lng=zh-CN");
    await expect(page.getByTestId("sidebar-toggle-right")).toHaveCount(0);
    await page.getByTestId("tab-more").click();
    await expect(page.getByTestId("site-info-panel")).toBeVisible();
    await expect(page.getByTestId("site-info-group-number")).toHaveText(QQ_GROUP);
  });
});
```

- [ ] **Step 2: Run the aion2 spec**

```bash
cd E:/arkive-games/arkive/frontend && E2E_PORT=5199 pnpm e2e:aion2 site-info
```

Expected: 6 passed. `E2E_PORT` is mandatory — the default `5173` reuses whatever already listens there.

- [ ] **Step 3: Write the palworld spec**

palworld switches locale through the UI (the pattern `e2e/smoke.spec.ts:38-46` uses), since its i18n resources are bundled rather than query-driven.

Create `apps/palworld/e2e/site-info.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

const PHONE = { width: 390, height: 844 }
const QQ_GROUP = '1091411026'

test.describe('site info — desktop', () => {
  test('the right sidebar renders, without a feedback group in English', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await expect(page.getByTestId('site-info-panel').first()).toBeVisible()
    await expect(page.getByTestId('site-info-group-number')).toHaveCount(0)
  })

  test('switching to zh-CN reveals the feedback group', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await page.getByTestId('lang-menu').click()
    await page.getByTestId('lang-zh-CN').click()
    await expect(page.getByTestId('site-info-group-number').first()).toHaveText(QQ_GROUP)
  })

  test('the left sidebar toggle is still unique', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('sidebar-toggle')).toHaveCount(1)
  })

  test('collapsing the right sidebar is remembered across reloads', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('site-info-panel').first()).toBeVisible()
    await page.getByTestId('sidebar-toggle-right').click()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('sidebar-toggle-right')).toBeVisible()
    await expect(page.getByTestId('site-info-panel')).toHaveCount(0)
  })

  test('the top-bar popover carries the panel on a catalog page', async ({ page }) => {
    await page.goto('/pals')
    await page.getByTestId('contact-menu').click()
    await expect(page.getByTestId('site-info-panel')).toBeVisible()
  })
})

test.describe('site info — phone', () => {
  test.use({ viewport: PHONE })

  test('the More sheet carries the panel and no right sidebar exists', async ({ page }) => {
    await page.goto('/pals')
    await expect(page.getByTestId('sidebar-toggle-right')).toHaveCount(0)
    await page.getByTestId('tab-more').click()
    await expect(page.getByTestId('site-info-panel')).toBeVisible()
  })
})
```

- [ ] **Step 4: Run the palworld spec**

```bash
cd E:/arkive-games/arkive/frontend && pnpm e2e:palworld site-info
```

Expected: 6 passed. If the language-menu testids differ from `lang-menu` / `lang-zh-CN`, read `packages/map-shell/src/ShellTopBar.tsx` for the real ones and fix the spec — do not change the component.

- [ ] **Step 5: Commit**

```bash
cd E:/arkive-games/arkive
git add frontend/apps/aion2/e2e/site-info.spec.ts frontend/apps/palworld/e2e/site-info.spec.ts
git commit -m "test: cover the site-info panel across both apps"
```

---

## Task 10: Full verification sweep

- [ ] **Step 1: Unit tests and package guards**

```bash
cd E:/arkive-games/arkive/frontend && pnpm test && pnpm check:shell && pnpm check:engine
```

Expected: all suites pass; both greps silent.

- [ ] **Step 2: Typecheck and lint both apps**

```bash
cd E:/arkive-games/arkive/frontend && pnpm --filter aion2 exec tsc --noEmit -p tsconfig.app.json && pnpm --filter palworld exec tsc --noEmit -p tsconfig.app.json && pnpm lint:aion2 && pnpm lint:palworld
```

Expected: no errors.

- [ ] **Step 3: Production builds**

```bash
cd E:/arkive-games/arkive/frontend && pnpm build:aion2 && pnpm build:palworld
```

Expected: both succeed.

- [ ] **Step 4: Full e2e, compared against the known baselines**

```bash
cd E:/arkive-games/arkive/frontend && E2E_PORT=5199 pnpm e2e:aion2; pnpm e2e:palworld
```

Expected: aion2 — the 1 pre-existing `wiki.spec.ts` embedded-map POI failure and nothing else; palworld — the 2 pre-existing failures (ko-KR smoke, dungeons "Hard · bonus") and nothing else. Any other failure is a regression from this work. Run the palworld suite twice if `breeding` or `global-search` flake — they only flake under full-suite load.

- [ ] **Step 5: Merge back, then live-test**

Everything above runs in the worktree. Live testing happens on `master`, per the workspace convention: integrate with **rebase**, never a merge commit.

```bash
cd E:/arkive-games/arkive && git status --short
```

Expected: clean (if the builds emitted tracked artifacts, do not commit them — confirm `dist/` is ignored first). Then rebase the branch onto `master` and fast-forward `master` onto it. Report to the user before doing this rather than pushing anywhere.

With `pnpm dev:aion2` (15173) and `pnpm dev:palworld` (15174) running on `master`, work through the four deferred checks (Task 4 Step 5, Task 5 Step 4, Task 7 Step 5, Task 8 Step 4). Then, at 1280×800 on each app: both sidebar tabs are reachable and do not overlap, the map fills the space after collapsing the right sidebar with no blank tiles, the panel is legible in light, dark and (aion2) its theme variants, and `/changelog` shows the new version entry.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| `SiteInfoPanel` presentational component (amended to `map-shell`) | 1 |
| `ShellSidebar` `side` prop, distinct right testid | 2 |
| `ShellLayout` `rightSidebar` slot | 2 |
| aion2 `rightSidebar` → `siteInfo` rename, dead-key removal | 3 |
| aion2 intro + disclaimer in 4 locales; zh-TW authored fresh | 3 |
| aion2 en-US / ko-KR Discord invites preserved | 3, 9 (asserted) |
| aion2 three legacy groups kept alongside the new one | 3 |
| aion2 popover + More sheet hosts | 4 |
| aion2 right sidebar + remembered collapse | 5 |
| palworld 17-locale strings, `contact` for zh only | 6 |
| palworld popover + More sheet hosts | 7 |
| palworld right sidebar + remembered collapse | 8 |
| QQ number as code, zh-only gating | 4, 7 |
| Copy button with unavailable-clipboard fallback | 1 |
| e2e across both apps, desktop + phone | 9 |
| `check:shell` stays green | 1, 2, 10 |
| Baseline-aware e2e comparison | 10 |
| Version bump in the same commit (aion2 1.7.0, palworld 1.9.0) | 5, 8 |
| Live testing only after the rebase back onto `master` | 10 |

**Deviations from the spec, both deliberate:**

1. The panel lives in `packages/map-shell`, not `packages/ui` — the spec was amended in place with the reasoning (test tooling exists there; `ui` has none).
2. Collapse persistence is plain `localStorage` inside each app's own `InfoSidebar` component rather than a `ThemeStorage`-style injected adapter. The adapter pattern exists so *packages* stay storage-free; these components live in the apps, so an injected indirection would add a layer with no consumer. Packages remain storage-free either way.

Two naming details worth knowing while reading the code: aion2's YAML keeps `contact.content` (its existing key name, so the rename diff stays minimal) while palworld's TS table uses `contact.hint`; they are unrelated files feeding the same prop, so nothing is shared. Sidebar width is 320 rather than the left sidebar's 346 — prose does not need the marker-grid width, and it gives back 26px of map.
