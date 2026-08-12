import {
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
} from "react"
import {
  IconCheck,
  IconLanguage,
  IconMoonStars,
} from "@tabler/icons-react"
import {
  Button,
  MENU_CONTENT_CLASS,
  MENU_ITEM_CLASS,
  cn,
} from "@gamemap/ui"

export const TOP_BAR_MENU_CLASS =
  `top-full z-[var(--arkive-layer-popover)] ${MENU_CONTENT_CLASS}`

export const TOP_BAR_MENU_ITEM_CLASS =
  `${MENU_ITEM_CLASS} !min-h-9 !py-1.5 whitespace-nowrap [&>[data-slot=nav-item-label]]:min-w-0 [&>[data-slot=nav-item-label]]:flex-1`

const TOP_BAR_MENU_VIEWPORT_CLASS =
  "max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain"

const TOP_BAR_MENU_WIDTH_CLASS = "w-max min-w-40 max-w-80"

const TOP_BAR_LANGUAGE_GRID_THRESHOLD = 8

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
  /** Optional action for a dropdown parent that also owns a destination. */
  onDropdownTriggerClick?: (item: ShellNavItem) => void
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
    nav?: string
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
  const [openUtilityMenu, setOpenUtilityMenu] = useState<"language" | "theme" | null>(null)

  return (
    // The same page-gutter escalation as the content below it, so the bar's edge
    // padding lines up with the page's instead of staying at 1rem forever. Utilities
    // rather than the CSS token, because callers override `root` wholesale and a
    // utility stays visible to them.
    <header className={cn("flex h-14 shrink-0 items-center gap-6 px-4 md:px-6 xl:px-8", classNames?.root)}>
      {(leftSlot || nav) && (
        <div className={cn("flex min-w-0 items-center gap-6", classNames?.left)}>
          {leftSlot}
          {nav && (
            <nav
              className={cn("flex min-w-0 items-center gap-6", classNames?.nav)}
              onPointerLeave={() => setHoveredNavKey(null)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setHoveredNavKey(null)
                }
              }}
            >
              {nav.items.map((item) => {
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
                    onFocus={() => setHoveredNavKey(item.key)}
                  >
                    {nav.renderItem(
                      item,
                      navItemClass(highlighted, nav),
                      navItemLabelClass(highlighted, nav),
                    )}
                  </span>
                )
              })}
            </nav>
          )}
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
          <ShellUtilityDropdown
            id="language"
            open={openUtilityMenu === "language"}
            onOpenChange={(open) => setOpenUtilityMenu((current) =>
              open ? "language" : current === "language" ? null : current
            )}
            options={languageSwitcher.languages.map(({ code, label }) => ({ value: code, label }))}
            current={languageSwitcher.current}
            onChange={languageSwitcher.onChange}
            menuLabel={languageSwitcher.menuLabel}
            shortLabel={languageSwitcher.shortLabel}
            icon={languageSwitcher.icon ?? <IconLanguage className="size-5" stroke={1.8} />}
            triggerClassName={classNames?.trigger}
            menuClassName={classNames?.menu}
          />
        )}
        {themeSwitcher && (
          <ShellUtilityDropdown
            id="theme"
            open={openUtilityMenu === "theme"}
            onOpenChange={(open) => setOpenUtilityMenu((current) =>
              open ? "theme" : current === "theme" ? null : current
            )}
            options={themeSwitcher.options}
            current={themeSwitcher.current}
            onChange={themeSwitcher.onChange}
            menuLabel={themeSwitcher.menuLabel}
            shortLabel={themeSwitcher.shortLabel}
            icon={<IconMoonStars className="size-5" stroke={1.8} />}
            triggerClassName={classNames?.trigger}
            menuClassName={classNames?.menu}
          />
        )}
        {rightExtras}
      </div>
    </header>
  )
}

export interface ShellUtilityDropdownProps {
  id: "language" | "theme"
  open: boolean
  onOpenChange: (open: boolean) => void
  options: { value: string; label: string }[]
  current: string
  onChange: (value: string) => void
  menuLabel: string
  shortLabel?: string
  icon?: ReactNode
  menuAlign?: "start" | "end"
  menuSide?: "top" | "bottom"
  triggerClassName?: string
  menuClassName?: string
}

export function ShellUtilityDropdown({
  id,
  open,
  onOpenChange,
  options,
  current,
  onChange,
  menuLabel,
  shortLabel,
  icon,
  menuAlign = "end",
  menuSide = "bottom",
  triggerClassName,
  menuClassName,
}: ShellUtilityDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const usesLanguageGrid = id === "language" && options.length > TOP_BAR_LANGUAGE_GRID_THRESHOLD
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onOpenChange(false)
  }

  return (
    <div
      className="relative inline-flex items-center"
      onPointerEnter={() => onOpenChange(true)}
      onPointerLeave={() => onOpenChange(false)}
      onFocus={() => onOpenChange(true)}
      onBlur={closeWhenFocusLeaves}
    >
      <Button
        ref={triggerRef}
        variant="ghost"
        size={shortLabel ? "default" : "icon"}
        data-testid={`${id === "language" ? "lang" : "theme"}-menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={menuLabel}
        title={menuLabel}
        className={triggerClassName}
        onClick={() => onOpenChange(true)}
        onPointerUp={(event) => event.currentTarget.blur()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onOpenChange(false)
            event.currentTarget.blur()
          }
          if (event.key === "ArrowDown") {
            event.preventDefault()
            onOpenChange(true)
            window.setTimeout(() => {
              menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus()
            }, 0)
          }
        }}
      >
        {icon}
        {shortLabel && <span className="text-sm font-semibold">{shortLabel}</span>}
      </Button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          className={cn(
            "absolute",
            menuAlign === "start" ? "left-0" : "right-0",
            TOP_BAR_MENU_CLASS,
            TOP_BAR_MENU_VIEWPORT_CLASS,
            usesLanguageGrid
              ? "grid w-[22rem] max-w-[calc(100vw-2rem)] grid-cols-2"
              : TOP_BAR_MENU_WIDTH_CLASS,
            menuSide === "top" && "top-auto bottom-full mb-2",
            menuClassName,
          )}
        >
          {options.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="menuitem"
              data-testid={`${id === "language" ? "lang" : "theme"}-${value}`}
              className={TOP_BAR_MENU_ITEM_CLASS}
              onClick={() => {
                onChange(value)
                onOpenChange(false)
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  onOpenChange(false)
                  triggerRef.current?.focus()
                }
              }}
            >
              <span className="flex-1">{label}</span>
              {current === value && <IconCheck className="size-4" stroke={1.8} />}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const [open, setOpen] = useState(false)
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setOpen(false)
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
        onClick={() => {
          if (nav.onDropdownTriggerClick) {
            nav.onDropdownTriggerClick(item)
            setOpen(false)
          } else {
            setOpen(true)
          }
          onHighlight(item.key)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false)
            onHighlight(null)
            event.currentTarget.blur()
          }
        }}
        className={cn(navItemClass(highlighted, nav), "inline-flex items-center")}
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
          // `w-max` is the load-bearing part, not `min-w-44`. This menu is
          // absolutely positioned inside a wrapper sized to its ~40px trigger,
          // so shrink-to-fit resolves its width against that, collapsing it to
          // the longest WORD and wrapping every label. A floor alone still
          // wraps the long ones -- fr-FR "Simulateur de statistiques" needs
          // ~214px against an 11rem floor. `max-w-80` keeps it bounded.
          className={cn(
            "absolute left-0",
            TOP_BAR_MENU_CLASS,
            TOP_BAR_MENU_VIEWPORT_CLASS,
            TOP_BAR_MENU_WIDTH_CLASS,
          )}
        >
          {children.map((child) => {
            const rendered = nav.renderItem(
                child,
                cn(
                  TOP_BAR_MENU_ITEM_CLASS,
                  child.active ? "bg-accent font-semibold text-primary" : "text-foreground",
                ),
              )
            const menuItem = isValidElement(rendered)
              ? cloneElement(rendered as ReactElement<{ role?: string }>, { role: "menuitem" })
              : rendered
            return <div key={child.key} role="none">{menuItem}</div>
          })}
        </div>
      )}
    </div>
  )
}
