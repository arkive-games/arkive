import type { ReactNode } from "react"
import { CheckIcon, ChevronDown, Languages, Settings } from "lucide-react"
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gamemap/ui"

export interface ShellNavItem {
  /** Stable key, e.g. the route path. */
  key: string
  label: ReactNode
  active?: boolean
  /**
   * When present and non-empty, this item renders as a dropdown: `label` (+ a
   * chevron) is the trigger and each child renders as a menu item via
   * `renderItem`. Children are leaf links — nested `children` are ignored.
   */
  children?: ShellNavItem[]
}

export interface ShellTopBarNav {
  items: ShellNavItem[]
  /**
   * Render one item as a link/button. The shell computes the class string
   * (base + active/inactive, incl. per-site overrides) and passes it in — the
   * app just wraps `label` in its router's Link. Keeps the shell router-agnostic.
   */
  renderItem: (item: ShellNavItem, className: string) => ReactNode
  /** Per-site overrides appended to the default inactive / active classes. */
  classNames?: { item?: string; itemActive?: string }
}

export interface ShellTopBarProps {
  leftSlot?: ReactNode
  /** Highlighted navigation shown in the left area; the active item is styled distinctly. */
  nav?: ShellTopBarNav
  rightExtras?: ReactNode
  languageSwitcher?: {
    languages: { code: string; label: string }[]
    current: string
    onChange: (code: string) => void
    menuLabel: string
  }
  themeSwitcher?: {
    options: { value: string; label: string }[]
    current: string
    onChange: (value: string) => void
    menuLabel: string
  }
  classNames?: {
    root?: string
    left?: string
    right?: string
    trigger?: string
    menu?: string
  }
}

export function ShellTopBar({
  leftSlot,
  nav,
  rightExtras,
  languageSwitcher,
  themeSwitcher,
  classNames,
}: ShellTopBarProps) {
  return (
    <header className={cn("flex h-12 shrink-0 items-center gap-6 px-4", classNames?.root)}>
      {(leftSlot || nav) && (
        <div className={cn("flex items-center gap-6", classNames?.left)}>
          {leftSlot}
          {nav?.items.map((item) =>
            item.children && item.children.length > 0 ? (
              <NavDropdown key={item.key} item={item} nav={nav} />
            ) : (
              <span key={item.key}>
                {nav.renderItem(item, navItemClass(item.active, nav))}
              </span>
            ),
          )}
        </div>
      )}
      <div className={cn("ml-auto flex items-center gap-1", classNames?.right)}>
        {languageSwitcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="lang-menu"
                aria-label={languageSwitcher.menuLabel}
                title={languageSwitcher.menuLabel}
                className={classNames?.trigger}
              >
                <Languages className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn("z-[2000]", classNames?.menu)}>
              {languageSwitcher.languages.map(({ code, label }) => (
                <DropdownMenuItem
                  key={code}
                  data-testid={`lang-${code}`}
                  onSelect={() => languageSwitcher.onChange(code)}
                >
                  <span className="flex-1">{label}</span>
                  {languageSwitcher.current === code && <CheckIcon className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {themeSwitcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="theme-menu"
                aria-label={themeSwitcher.menuLabel}
                title={themeSwitcher.menuLabel}
                className={classNames?.trigger}
              >
                <Settings className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={cn("z-[2000]", classNames?.menu)}>
              {themeSwitcher.options.map(({ value, label }) => (
                <DropdownMenuItem
                  key={value}
                  data-testid={`theme-${value}`}
                  onSelect={() => themeSwitcher.onChange(value)}
                >
                  <span className="flex-1">{label}</span>
                  {themeSwitcher.current === value && <CheckIcon className="size-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {rightExtras}
      </div>
    </header>
  )
}

/** Base + active/inactive classes for a top-bar nav item (link or dropdown trigger). */
function navItemClass(active: boolean | undefined, nav: ShellTopBarNav): string {
  return cn(
    "text-sm transition-colors",
    active
      ? cn("font-semibold text-primary", nav.classNames?.itemActive)
      : cn("text-foreground/70 hover:text-foreground", nav.classNames?.item),
  )
}

/** A top-bar item that owns children: renders a dropdown of leaf links. */
function NavDropdown({ item, nav }: { item: ShellNavItem; nav: ShellTopBarNav }) {
  const children = item.children ?? []
  const groupActive = item.active || children.some((c) => c.active)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid={`nav-dropdown-${item.key}`}
          className={cn(navItemClass(groupActive, nav), "inline-flex items-center gap-1")}
        >
          {item.label}
          <ChevronDown className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[2000]">
        {children.map((child) => (
          <DropdownMenuItem key={child.key} asChild>
            {nav.renderItem(
              child,
              cn("w-full", child.active ? "font-semibold text-primary" : "text-foreground"),
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
