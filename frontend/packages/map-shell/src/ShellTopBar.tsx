import { useState, type FocusEvent, type ReactNode } from "react"
import {
  IconCheck,
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
  /** Optional leaf links shown in a hover menu. */
  children?: ShellNavItem[]
}

export interface ShellTopBarNav {
  items: ShellNavItem[]
  /** Render one item as a link or button while the shell owns its visual state. */
  renderItem: (
    item: ShellNavItem,
    className: string,
    labelClassName?: string,
  ) => ReactNode
  classNames?: {
    item?: string
    itemActive?: string
    label?: string
    labelActive?: string
  }
}

export interface ShellTopBarProps {
  leftSlot?: ReactNode
  nav?: ShellTopBarNav
  rightExtras?: ReactNode
  /** Legacy right-cluster search slot. Prefer centerSlot for utility search. */
  search?: ReactNode
  /** Optional utility area visually separated from the right-side controls. */
  centerSlot?: ReactNode
  languageSwitcher?: {
    languages: { code: string; label: string }[]
    current: string
    onChange: (code: string) => void
    menuLabel: string
    shortLabel?: string
    icon?: ReactNode
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
    center?: string
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
  centerSlot,
  languageSwitcher,
  themeSwitcher,
  classNames,
}: ShellTopBarProps) {
  const [hoveredNavKey, setHoveredNavKey] = useState<string | null>(null)

  return (
    <header className={cn("flex h-12 shrink-0 items-center gap-6 px-4", classNames?.root)}>
      {(leftSlot || nav) && (
        <div className={cn("flex min-w-0 items-center gap-6", classNames?.left)}>
          {leftSlot}
          {nav?.items.map((item) => {
            const groupActive = item.active || item.children?.some((child) => child.active)
            const highlighted = hoveredNavKey === null ? groupActive : hoveredNavKey === item.key
            return item.children && item.children.length > 0 ? (
              <NavDropdown
                key={item.key}
                item={item}
                nav={nav}
                highlighted={highlighted}
                onHighlight={setHoveredNavKey}
              />
            ) : (
              <span
                key={item.key}
                className="inline-flex items-center"
                onPointerEnter={() => setHoveredNavKey(item.key)}
                onPointerLeave={() => setHoveredNavKey(null)}
                onFocus={() => setHoveredNavKey(item.key)}
                onBlur={() => setHoveredNavKey(null)}
              >
                {nav.renderItem(
                  item,
                  navItemClass(item.active, nav),
                  navItemLabelClass(highlighted, nav),
                )}
              </span>
            )
          })}
        </div>
      )}
      {centerSlot && (
        <div className={cn("ml-auto hidden min-w-0 xl:flex", classNames?.center)}>
          {centerSlot}
        </div>
      )}
      <div
        className={cn(
          centerSlot
            ? "ml-auto flex shrink-0 items-center gap-1 xl:ml-0"
            : "ml-auto flex shrink-0 items-center gap-1",
          classNames?.right,
        )}
      >
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
                {languageSwitcher.icon ?? <IconLanguage className="size-5" stroke={1.8} />}
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

function navItemClass(active: boolean | undefined, nav: ShellTopBarNav): string {
  return cn(
    "text-lg transition-colors",
    active
      ? cn("font-semibold text-primary", nav.classNames?.itemActive)
      : cn("text-foreground/70 hover:text-foreground", nav.classNames?.item),
  )
}

function navItemLabelClass(highlighted: boolean | undefined, nav: ShellTopBarNav): string {
  return cn(nav.classNames?.label, highlighted && nav.classNames?.labelActive)
}

function NavDropdown({
  item,
  nav,
  highlighted,
  onHighlight,
}: {
  item: ShellNavItem
  nav: ShellTopBarNav
  highlighted: boolean | undefined
  onHighlight: (key: string | null) => void
}) {
  const children = item.children ?? []
  const groupActive = item.active || children.some((child) => child.active)
  const [open, setOpen] = useState(false)
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false)
      onHighlight(null)
    }
  }

  return (
    <div
      className="relative inline-flex items-center"
      onPointerEnter={() => {
        setOpen(true)
        onHighlight(item.key)
      }}
      onPointerLeave={() => {
        setOpen(false)
        onHighlight(null)
      }}
      onFocus={() => {
        setOpen(true)
        onHighlight(item.key)
      }}
      onBlur={closeWhenFocusLeaves}
    >
      <button
        type="button"
        data-testid={`nav-dropdown-${item.key}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            onHighlight(null)
            event.currentTarget.blur()
          }
        }}
        className={cn(navItemClass(groupActive, nav), "inline-flex items-center")}
      >
        <span
          data-slot="nav-item-label"
          className={navItemLabelClass(highlighted, nav)}
        >
          {item.label}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-[2000] min-w-44 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {children.map((child) => (
            <div key={child.key} role="none" className="[&>a]:block">
              {nav.renderItem(
                child,
                cn(
                  "w-full rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none",
                  child.active ? "font-semibold text-primary" : "text-foreground",
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
