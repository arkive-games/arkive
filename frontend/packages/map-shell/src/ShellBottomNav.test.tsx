// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShellBottomNav, type ShellBottomNavProps } from "./ShellBottomNav"
import { ThemeProvider } from "./theme/ThemeProvider"

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
  it("renders each tab through the app's renderer, inside the drawer", () => {
    const api = render(<ShellBottomNav {...props()} />)
    // Nothing but the menu button is on the page until it is opened.
    expect(api.queryByTestId("tab-/")).toBeNull()
    open(api)
    expect(api.getByTestId("tab-/").className).toContain("bg-primary")
    expect(api.getByTestId("tab-/x").className).not.toContain("bg-primary")
    expect(api.getByTestId("i-map")).toBeTruthy()
  })

  it("keeps the testids the e2e suites depend on", () => {
    const api = render(<ShellBottomNav {...props()} />)
    const button = api.getByTestId("tab-more")
    // A round top-right button, not a bottom bar: the phone web has no tab bar.
    expect(button.className).toContain("arkive-menu-button")
    expect(button.className).toContain("md:hidden")
    expect(button.getAttribute("aria-label")).toBe("More")
    open(api)
    expect(api.getByTestId("more-sheet").className).toContain("arkive-more-sheet")
    expect(api.getByTestId("bottom-tab-bar")).toBeTruthy()
    expect(api.getByTestId("tab-/").className).toContain("min-h-16")
    expect(api.getByTestId("more-lang-open")).toBeTruthy()
    expect(api.getByTestId("more-theme-auto")).toBeTruthy()
  })
  it("drives the theme pills from the surrounding ThemeProvider when not wired by hand", () => {
    const base = props()
    const api = render(
      <ThemeProvider>
        <ShellBottomNav {...base} theme={{ options: base.theme.options, rowLabel: "Theme" }} />
      </ThemeProvider>,
    )
    open(api)
    expect(api.getByTestId("more-theme-auto").getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(api.getByTestId("more-theme-dark"))
    expect(api.getByTestId("more-theme-dark").getAttribute("aria-pressed")).toBe("true")
    expect(api.getByTestId("more-theme-auto").getAttribute("aria-pressed")).toBe("false")
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

  it("marks the selected theme with aria-pressed", () => {
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.getByTestId("more-theme-auto").getAttribute("aria-pressed")).toBe("true")
    const darkTheme = api.getByTestId("more-theme-dark")
    expect(darkTheme.getAttribute("aria-pressed")).toBe("false")
    expect(darkTheme.className).toContain("whitespace-normal")
    expect(darkTheme.className).not.toContain("truncate")
  })

  it("closes when the path changes, so the sheet cannot cover its destination", () => {
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.getByTestId("more-sheet")).toBeTruthy()
    api.rerender(<ShellBottomNav {...props({ pathname: "/elsewhere" })} />)
    expect(api.queryByTestId("more-sheet")).toBeNull()
  })

  it("closes when the viewport crosses to desktop", () => {
    // The button is md:hidden, but the drawer portals to <body> and so is not
    // hidden by that class. Rotating a phone to landscape crosses 768px, and
    // without this the sheet stays draped over the desktop layout.
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.getByTestId("more-sheet")).toBeTruthy()
    setViewport(false)
    expect(api.queryByTestId("more-sheet")).toBeNull()
  })

  it("renders the grid and footer slots where given", () => {
    const api = render(
      <ShellBottomNav
        {...props({
          grid: {
            items: [{ key: "w", label: "Wiki", icon: <i />, active: true }],
            renderItem: (item, className) => (
              <a key={item.key} data-testid="grid-w" className={className}>
                {item.label}
              </a>
            ),
          },
          footer: <span data-testid="footer" />,
        })}
      />,
    )
    open(api)
    expect(api.getByTestId("footer")).toBeTruthy()
    // An active grid item is filled, matching the tab-strip convention.
    expect(api.getByTestId("grid-w").className).toContain("bg-primary")
  })

  it("omits the grid block when an app has no secondary pages", () => {
    const api = render(<ShellBottomNav {...props()} />)
    open(api)
    expect(api.queryByTestId("grid-w")).toBeNull()
  })

  describe("group tabs", () => {
    const grouped = () =>
      props({
        tabs: [
          { key: "/", label: "Home", icon: <i /> },
          {
            key: "tools",
            label: "Tools",
            icon: <i />,
            active: true,
            children: [
              { key: "/a", label: "A", icon: <i />, active: true },
              { key: "/b", label: "B", icon: <i /> },
            ],
          },
        ],
      })

    it("lists its children under the group's label instead of rendering a link", () => {
      const api = render(<ShellBottomNav {...grouped()} />)
      open(api)
      // The group's key is not a route, so it must never reach renderTab as a tab.
      expect(api.queryByTestId("tab-tools")).toBeNull()
      const section = api.getByTestId("tab-group-tools")
      expect(section.textContent).toContain("Tools")
      expect(section.contains(api.getByTestId("tab-/a"))).toBe(true)
      expect(section.contains(api.getByTestId("tab-/b"))).toBe(true)
      // The current child is filled, exactly as in the grid.
      expect(api.getByTestId("tab-/a").className).toContain("bg-primary")
      expect(api.getByTestId("tab-/b").className).not.toContain("bg-primary")
    })

    it("keeps leaf tabs in the primary section", () => {
      const api = render(<ShellBottomNav {...grouped()} />)
      open(api)
      expect(api.getByTestId("tab-group-primary").contains(api.getByTestId("tab-/"))).toBe(true)
    })

    it("closes on navigation", () => {
      const api = render(<ShellBottomNav {...grouped()} />)
      open(api)
      expect(api.queryByTestId("tab-/a")).toBeTruthy()
      api.rerender(<ShellBottomNav {...grouped()} pathname="/a" />)
      expect(api.queryByTestId("more-sheet")).toBeNull()
    })
  })
})
