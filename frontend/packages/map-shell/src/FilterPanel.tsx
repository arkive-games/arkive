import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  cn,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@gamemap/ui"
import { deriveEyeState, syncExpanded } from "./filter-logic"
import { IdLabel, type IdLabelValue } from "./IdLabel"
import { OverflowMarquee } from "./OverflowMarquee"

export interface FilterSubtype {
  id: string
  label: string
  active: boolean
  icon?: ReactNode
  /** Id chip on the right of the button (e.g. "No.037" with an accented "B"),
   *  styled by the shared IdLabel component. */
  idLabel?: IdLabelValue
  /** Plain free-text on the right of the button (e.g. a "3/12" count string). */
  badge?: string
  /** Numeric marker count shown on the right of the button (rightmost). */
  count?: number
}

export interface FilterCategory {
  id: string
  label: string
  icon?: ReactNode
  subtypes: FilterSubtype[]
}

export interface FilterControl {
  id: string
  label: string
  onClick: () => void
  active?: boolean
  testId?: string
}

export interface FilterPanelClassNames {
  root?: string
  controls?: string
  controlButton?: string
  controlButtonActive?: string
  category?: string
  categoryHeader?: string
  categoryEyeToggle?: string
  subtypeGrid?: string
  subtypeButton?: string
  subtypeButtonActive?: string
}

export interface FilterPanelProps {
  categories: FilterCategory[]
  onToggleSubtype: (id: string) => void
  onSetCategory?: (categoryId: string, visible: boolean) => void
  categoryToggleLabels?: { show: string; hide: string }
  controls?: FilterControl[]
  classNames?: FilterPanelClassNames
  /** Category ids that start collapsed instead of auto-expanding (e.g. a large
   *  "pal" list). Users can still open them; the choice is then preserved. */
  defaultCollapsedCategoryIds?: string[]
}

// h-9 is desktop_compact_height (2.25rem), which the map UI spec sets as the minimum
// for both the bulk controls and the subtype chips. A fixed height rather than a
// minimum, so a wrapped or badged label cannot change a row's size. This was 30px,
// which cleared the 24px AA floor but was below the spec's own figure; `leading-none`
// replaces a hard-coded 14px that the row height no longer depends on.
const BUTTON_BASE =
  "flex h-9 w-full items-center gap-2 rounded-sm px-2 text-sm font-normal leading-none transition-colors"
const BUTTON_ACTIVE_DEFAULT = "bg-primary text-primary-foreground"
const BUTTON_INACTIVE_DEFAULT = "bg-muted text-foreground"

export function FilterPanel({
  categories,
  onToggleSubtype,
  onSetCategory,
  categoryToggleLabels,
  controls,
  classNames,
  defaultCollapsedCategoryIds,
}: FilterPanelProps) {
  // Categories auto-expand as data loads async, except those in
  // `defaultCollapsedCategoryIds` which start closed; keep the expanded set in
  // sync as categories appear while preserving user collapses (aion2 donor).
  const [expanded, setExpanded] = useState<string[]>([])
  const idsKey = categories.map((c) => c.id).join("|")
  const collapsedKey = (defaultCollapsedCategoryIds ?? []).join("|")
  const collapsedByDefault = useMemo(
    () => new Set(defaultCollapsedCategoryIds ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collapsedKey],
  )
  useEffect(() => {
    setExpanded((prev) => syncExpanded(prev, categories.map((c) => c.id), collapsedByDefault))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, collapsedByDefault])

  return (
    <div className={cn("flex w-full flex-col", classNames?.root)}>
      {controls && controls.length > 0 && (
        // gap-2 = space-2 both ways, per bulk_controls.gap. Was gap-x-2.5 (0.625rem),
        // which is not an approved spacing step.
        <div className={cn("grid grid-cols-2 gap-2", classNames?.controls)}>
          {controls.map((control) => {
            const active = control.active === true
            return (
              <button
                key={control.id}
                type="button"
                data-testid={control.testId}
                aria-pressed={control.active}
                onClick={control.onClick}
                className={cn(
                  BUTTON_BASE,
                  active ? BUTTON_ACTIVE_DEFAULT : BUTTON_INACTIVE_DEFAULT,
                  classNames?.controlButton,
                  active && classNames?.controlButtonActive,
                )}
              >
                {control.label}
              </button>
            )
          })}
        </div>
      )}

      <Accordion type="multiple" value={expanded} onValueChange={setExpanded} className="w-full">
        {categories.map((category) => {
          const eyeState = deriveEyeState(category.subtypes)
          const tooltipText =
            eyeState === "all"
              ? (categoryToggleLabels?.hide ?? "")
              : (categoryToggleLabels?.show ?? "")
          const toggleCategory = (e: MouseEvent) => {
            e.preventDefault()
            e.stopPropagation()
            onSetCategory?.(category.id, eyeState !== "all")
          }

          return (
            <AccordionItem
              key={category.id}
              value={category.id}
              className={cn("border-b-0", classNames?.category)}
            >
              {/* min-h-10 states the spec's 2.5rem category minimum outright. The
                  padding already exceeded it, so this changes nothing today and stops
                  a later padding tweak from quietly dropping below it. */}
              <AccordionTrigger
                className={cn(
                  "min-h-10 cursor-default items-center gap-1 px-0 pt-3 pb-0 hover:no-underline [&>svg]:translate-y-0",
                  classNames?.categoryHeader,
                )}
              >
                <div className="my-2 flex w-full items-center justify-between gap-2 px-0">
                  <div className="flex items-center gap-2">
                    {category.icon && (
                      <span className="flex h-4 w-4 items-center justify-center">
                        {category.icon}
                      </span>
                    )}
                    <span className="text-sm font-medium leading-[14px]">{category.label}</span>
                  </div>

                  {onSetCategory && (
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={toggleCategory}
                            aria-label={tooltipText}
                            className={cn(
                              "shrink-0 rounded-sm p-1 transition-opacity hover:bg-black/5 dark:hover:bg-white/10",
                              eyeState === "none" && "opacity-40",
                              classNames?.categoryEyeToggle,
                            )}
                          >
                            {eyeState === "none" ? (
                              <IconEyeOff className="size-4" stroke={1.8} />
                            ) : (
                              <IconEye className="size-4" stroke={1.8} />
                            )}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{tooltipText}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </AccordionTrigger>

              <AccordionContent className="pt-0 pb-0">
                {/* space-2 horizontally, space-1 vertically, per subtype_controls.gap --
                    tighter rows than the bulk grid, so a long category reads as one
                    block rather than a list of separated items. */}
                <div className={cn("grid grid-cols-2 gap-x-2 gap-y-1", classNames?.subtypeGrid)}>
                  {category.subtypes.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      data-testid={`subtype-toggle-${sub.id}`}
                      aria-pressed={sub.active}
                      onClick={() => onToggleSubtype(sub.id)}
                      className={cn(
                        BUTTON_BASE,
                        sub.active ? BUTTON_ACTIVE_DEFAULT : BUTTON_INACTIVE_DEFAULT,
                        classNames?.subtypeButton,
                        sub.active && classNames?.subtypeButtonActive,
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="flex min-w-0 flex-1 items-center gap-1">
                          {sub.icon}
                          <OverflowMarquee text={sub.label} className="flex-1" />
                        </span>
                        {(sub.idLabel !== undefined || sub.badge !== undefined || sub.count !== undefined) && (
                          <span className="flex shrink-0 items-center gap-1.5 text-xs">
                            {sub.idLabel !== undefined && <IdLabel value={sub.idLabel} />}
                            {sub.badge !== undefined && <span>{sub.badge}</span>}
                            {sub.count !== undefined && (
                              <span className="tabular-nums">{sub.count}</span>
                            )}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}
