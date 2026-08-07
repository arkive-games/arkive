import type { ReactNode } from "react"
import {
  IconCheck,
  IconChevronDown,
  IconLanguage,
  IconMoonStars,
} from "@tabler/icons-react"
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
  renderItem: (
    item: ShellNavItem,
    className: string,
    labelClassName?: string,
  ) => ReactNode
  /** Per-site overrides appended to the default inactive / active classes. */
  classNames?: {
    item?: string
    itemActive?: string
    label?: string
    labelActive?: string
    chevron?: string
  }
}

export interface ShellTopBarProps {
  leftSlot?: ReactNode
  /** Highlighted navigation shown in the left area; the active item is styled distinctly. */
  nav?: ShellTopBarNav
  rightExtras?: ReactNode
  /** Global search widget, rendered at the start of the right-side cluster. */
  search?: ReactNode
  languageSwitcher?: {
    languages: { code: string; label: string }[]
    current: string
    onChange: (code: string) => void
    menuLabel: string
    shortLabel?: string
  }
  themeSwitcher?: {
    options: { value: string; label: string }[]
    current: string
    onChange: (value: string) => void
    menuLabel: string
    shortLabel?: string
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
  search,
  languageSwitcher,
  themeSwitcher,
  classNames,
}: ShellTopBarProps) {
  return (
    <header className={cn("flex h-12 shrink-0 items-center gap-6 px-4", classNames?.root)}>
      {(leftSlot || nav) && (
        // `min-w-0` so this side can actually yield: without it the wrapper
        // refuses to shrink below its content, so a long left slot pushes the
        // right-hand controls clean off the viewport instead of letting its own
        // `truncate` engage. aion2's notice did exactly that — six icons,
        // search included, sat past the right edge between 768 and ~1000px.
        <div className={cn("flex min-w-0 items-center gap-6", classNames?.left)}>
          {leftSlot}
          {nav?.items.map((item) =>
            item.children && item.children.length > 0 ? (
              <NavDropdown key={item.key} item={item} nav={nav} />
            ) : (
              <span key={item.key} className="inline-flex items-center">
                {nav.renderItem(
                  item,
                  navItemClass(item.active, nav),
                  navItemLabelClass(item.active, nav),
                )}
              </span>
            ),
          )}
        </div>
      )}
      {/* `shrink-0`: the controls are icon-sized already and must stay reachable,
          so pressure goes to the left slot, which can truncate. */}
      <div className={cn("ml-auto flex shrink-0 items-center gap-1", classNames?.right)}>
        {search}
        {languageSwitcher && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size={languageSwitcher.shortLabel ? "default" : "icon"}
                data-testid="lang-menu"
                aria-label={languageSwitcher.menuLabel}
                title={languageSwitcher.menuLabel}
                className={classNames?.trigger}
              >
                <IconLanguage className="size-5" stroke={1.8} />
                {languageSwitcher.shortLabel && (
                  <span className="text-sm font-semibold">{languageSwitcher.shortLabel}</span>
                )}
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
                  {languageSwitcher.current === code && <IconCheck className="size-4" stroke={1.8} />}
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
                size={themeSwitcher.shortLabel ? "default" : "icon"}
                data-testid="theme-menu"
                aria-label={themeSwitcher.menuLabel}
                title={themeSwitcher.menuLabel}
                className={classNames?.trigger}
              >
                <IconMoonStars className="size-5" stroke={1.8} />
                {themeSwitcher.shortLabel && (
                  <span className="text-sm font-semibold">{themeSwitcher.shortLabel}</span>
                )}
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
                  {themeSwitcher.current === value && <IconCheck className="size-4" stroke={1.8} />}
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

/**
 * Base + active/inactive classes for a top-bar nav item (link or dropdown trigger).
 *
 * `text-lg`, deliberately a step ABOVE body text: navigation is chrome the eye
 * should find first, and it used to be `text-sm` — a step BELOW the prose it sat
 * above, which read as an afterthought. The bar's `h-12` is 3rem = 51px at the
 * 17px root, so a 1.125rem line box (28.9px) still clears it with room to spare;
 * the pressure from this change is horizontal, not vertical.
 */
function navItemClass(active: boolean | undefined, nav: ShellTopBarNav): string {
  return cn(
    "text-lg transition-colors",
    active
      ? cn("font-semibold text-primary", nav.classNames?.itemActive)
      : cn("text-foreground/70 hover:text-foreground", nav.classNames?.item),
  )
}

function navItemLabelClass(active: boolean | undefined, nav: ShellTopBarNav): string {
  return cn(nav.classNames?.label, active && nav.classNames?.labelActive)
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
          <span
            data-slot="nav-item-label"
            className={navItemLabelClass(groupActive, nav)}
          >
            {item.label}
          </span>
          <IconChevronDown
            className={cn("size-4", nav.classNames?.chevron)}
            stroke={1.8}
            aria-hidden
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[2000]">
        {children.map((child) => (
          <DropdownMenuItem key={child.key} asChild>
            {nav.renderItem(
              child,
              // `text-lg` to match the trigger these sit under — they are the
              // same navigation, one level down. DropdownMenuItem's own default
              // is text-sm, which is right for settings menus and wrong here.
              cn("w-full text-lg", child.active ? "font-semibold text-primary" : "text-foreground"),
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
