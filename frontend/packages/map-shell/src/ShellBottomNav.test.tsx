// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShellBottomNav, type ShellBottomNavProps } from "./ShellBottomNav"

/**
 * jsdom ships no `matchMedia`, and `useIsMobile` calls it unguarded. The stub is
 * also the handle for the rotation test below: `setViewport` flips `matches` and
 * fires the listeners, which is how a real breakpoint crossing arrives.
 */
const listeners = new Set<() => void>()
let mobile = true
function setViewport(isMobile: boolean) {
  mobile = isMobile
  act(() => {
    listeners.forEach((fn) => fn())
  })
}

beforeEach(() => {
  listeners.clear()
  mobile = true
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() {
      return mobile
    },
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
    addListener: (fn: () => void) => void listeners.add(fn),
    removeListener: (fn: () => void) => void listeners.delete(fn),
    dispatchEvent: () => false,
    onchange: null,
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function props(over: Partial<ShellBottomNavProps> = {}): ShellBottomNavProps {
  return {
    pathname: "/",
    tabs: [
      { key: "/", label: "Map", icon: <i data-testid="i-map" />, active: true },
      { key: "/x", label: "X", icon: <i /> },
    ],
    renderTab: (tab, className) => (
      <a data-testid={`tab-${tab.key}`} className={className}>
        {tab.icon}
        {tab.label}
      </a>
    ),
    more: { label: "More", icon: <i />, title: "More" },
    language: {
      languages: [
        { code: "en-US", label: "English" },
        { code: "zh-CN", label: "简体中文" },
      ],
      current: "zh-CN",
      onChange: vi.fn(),
      rowLabel: "Language",
      backLabel: "Back",
    },
    theme: {
      options: [
        { value: "auto", label: "System" },
        { value: "dark", label: "Dark" },
      ],
      current: "auto",
      onChange: vi.fn(),
      rowLabel: "Theme",
    },
    ...over,
  }
}

function open(api: ReturnType<typeof render>) {
  fireEvent.click(api.getByTestId("tab-more"))
}

describe("ShellBottomNav", () => {
  it("renders each tab through the app's renderer, with the shell's classes", () => {
    const api = render(<ShellBottomNav {...props()} />)
    expect(api.getByTestId("tab-/").className).toContain("text-primary")
    expect(api.getByTestId("tab-/x").className).toContain("text-muted-foreground")
    expect(api.getByTestId("i-map")).toBeTruthy()
  })

  it("keeps the testids the e2e suites depend on", () => {
    const api = render(<ShellBottomNav {...props()} />)
    expect(api.getByTestId("bottom-tab-bar")).toBeTruthy()
    open(api)
    expect(api.getByTestId("more-sheet")).toBeTruthy()
    expect(api.getByTestId("more-lang-open")).toBeTruthy()
    expect(api.getByTestId("more-theme-auto")).toBeTruthy()
  })

  describe("the language drill-down", () => {
    it("shows the current language as a row value rather than listing every option", () => {
      const api = render(<ShellBottomNav {...props()} />)
      open(api)
      expect(api.getByTestId("more-lang-open").textContent).toContain("简体中文")
      expect(api.queryByTestId("more-lang-en-US")).toBeNull()
    })

    it("swaps to the sub-page, and the sheet title follows it", () => {
      const api = render(<ShellBottomNav {...props()} />)
      open(api)
      fireEvent.click(api.getByTestId("more-lang-open"))
      expect(api.getByTestId("more-lang-back")).toBeTruthy()
      expect(api.getByTestId("more-lang-en-US")).toBeTruthy()
      // Title tracks the body so the sub-page is announced.
      expect(api.getByTestId("more-sheet").textContent).toContain("Language")
      // The main body is gone, not merely hidden.
      expect(api.queryByTestId("more-theme-auto")).toBeNull()
    })

    it("picks a language and returns to the main body", () => {
      const onChange = vi.fn()
      const api = render(<ShellBottomNav {...props({ language: { ...props().language, onChange } })} />)
      open(api)
      fireEvent.click(api.getByTestId("more-lang-open"))
      fireEvent.click(api.getByTestId("more-lang-en-US"))
      expect(onChange).toHaveBeenCalledWith("en-US")
      expect(api.getByTestId("more-theme-auto")).toBeTruthy()
      expect(api.queryByTestId("more-lang-back")).toBeNull()
    })

    it("reopens on the main body after being closed on the sub-page", () => {
      const api = render(<ShellBottomNav {...props()} />)
      open(api)
      fireEvent.click(api.getByTestId("more-lang-open"))
      fireEvent.keyDown(document.body, { key: "Escape" })
      open(api)
      // Reopening on the language list would look like the wrong menu opened.
      expect(api.getByTestId("more-theme-auto")).toBeTruthy()
      expect(api.queryByTestId("more-lang-back")).toBeNull()
    })
  })

  it("marks the selected theme and engine with aria-pressed", () => {
    const api = render(
      <ShellBottomNav
        {...props({
          engine: {
            choices: [
              { value: "gl", label: "GL" },
              { value: "leaflet", label: "DOM" },
            ],
            current: "gl",
            onChange: vi.fn(),
            rowLabel: "Renderer",
          },
        })}
      />,
    )
    open(api)
    expect(api.getByTestId("more-theme-auto").getAttribute("aria-pressed")).toBe("true")
    expect(api.getByTestId("more-theme-dark").getAttribute("aria-pressed")).toBe("false")
    expect(api.getByTestId("more-engine-gl").getAttribute("aria-pressed")).toBe("true")
  })

  it("omits the engine row entirely for a single-engine app", () => {
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.queryByTestId("more-engine-gl")).toBeNull()
  })

  it("closes when the path changes, so the sheet cannot cover its destination", () => {
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.getByTestId("more-sheet")).toBeTruthy()
    api.rerender(<ShellBottomNav {...props({ pathname: "/elsewhere" })} />)
    expect(api.queryByTestId("more-sheet")).toBeNull()
  })

  it("closes when the viewport crosses to desktop", () => {
    // The strip is md:hidden, but the sheet portals to <body> and so is not
    // hidden by that class. Rotating a phone to landscape crosses 768px, and
    // without this the sheet stays draped over the desktop layout.
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.getByTestId("more-sheet")).toBeTruthy()
    setViewport(false)
    expect(api.queryByTestId("more-sheet")).toBeNull()
  })

  it("renders the grid, brand, extra and footer slots where given", () => {
    const api = render(
      <ShellBottomNav
        {...props({
          more: { label: "More", icon: <i />, title: "More", brand: <a data-testid="brand">Arkive</a> },
          grid: {
            items: [{ key: "w", label: "Wiki", icon: <i />, active: true }],
            renderItem: (item, className) => (
              <a key={item.key} data-testid="grid-w" className={className}>
                {item.label}
              </a>
            ),
          },
          extra: <span data-testid="extra" />,
          footer: <span data-testid="footer" />,
        })}
      />,
    )
    open(api)
    expect(api.getByTestId("brand")).toBeTruthy()
    expect(api.getByTestId("extra")).toBeTruthy()
    expect(api.getByTestId("footer")).toBeTruthy()
    // An active grid item is filled, matching the tab-strip convention.
    expect(api.getByTestId("grid-w").className).toContain("bg-primary")
  })

  it("omits the grid block when an app has no secondary pages", () => {
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.queryByTestId("grid-w")).toBeNull()
  })
})
