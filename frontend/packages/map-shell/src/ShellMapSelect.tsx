import type { CSSProperties } from "react"
import { cn, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gamemap/ui"

export interface ShellMapSelectProps {
  maps: { id: string; label: string }[]
  activeMapId: string
  onSelectMap: (id: string) => void
  placeholder?: string
  barStyle?: CSSProperties
  classNames?: {
    wrapper?: string
    bar?: string
    trigger?: string
    content?: string
    item?: string
  }
}

const defaultBarStyle: CSSProperties = {
  background:
    "linear-gradient(90deg, rgba(190,211,222,0) 0%, rgba(190,211,222,0.5) 54%, rgba(190,211,222,0) 100%)",
  borderImage:
    "linear-gradient(90deg, rgba(165,187,200,0), rgba(165,187,200,1), rgba(165,187,200,0)) 1",
}

export function ShellMapSelect({
  maps,
  activeMapId,
  onSelectMap,
  placeholder,
  barStyle,
  classNames,
}: ShellMapSelectProps) {
  return (
    <div className={cn("flex w-full justify-center", classNames?.wrapper)}>
      <div
        className={cn(
          "flex h-[38px] w-[314px] items-center justify-center rounded-none border border-transparent",
          classNames?.bar,
        )}
        style={barStyle ?? defaultBarStyle}
      >
        <Select value={activeMapId} onValueChange={onSelectMap}>
          <SelectTrigger
            data-testid="map-select"
            size="sm"
            className={cn(
              "w-auto max-w-[260px] justify-center gap-2 border-transparent bg-transparent px-2 py-1 text-lg font-medium leading-[18px] text-foreground shadow-none hover:bg-transparent focus-visible:ring-0 data-[state=open]:bg-transparent",
              classNames?.trigger,
            )}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          {/* z-[3100]: the map picker is also rendered inside the mobile filter
              bottom-sheet, and both the sheet and this listbox portal to <body>
              as siblings. @gamemap/ui ships Select content at z-50 while a Sheet
              sits at z-3000, and Radix copies the content's computed z-index
              onto the fixed positioning wrapper — so the list opened *behind*
              the sheet. Worse, Radix's dialog overlay carries an inline
              `pointer-events: auto` (to survive the body-level
              `pointer-events: none`), so at z-3000 it also swallowed every tap
              aimed at an option: the picker looked completely dead on phones.
              Lift the listbox above sheet level; a popup must always be the
              topmost layer. Matches aion2's alert-dialog override (3050/3100).
              Desktop is unaffected — nothing there sits between z-50 and
              z-3100. Still overridable via `classNames.content`, since
              tailwind-merge lets a later z-* win. */}
          <SelectContent className={cn("z-[3100] rounded-none", classNames?.content)}>
            {maps.map((m) => (
              <SelectItem key={m.id} value={m.id} data-testid={`map-option-${m.id}`} className={classNames?.item}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
