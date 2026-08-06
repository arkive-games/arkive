import type { ReactNode } from 'react'
import { useState } from 'react'

/**
 * A titled panel with a collapse control.
 *
 * Only the chevron toggles. The whole header used to be the button, which meant
 * every attempt to select the title text collapsed the section instead — an
 * easy mis-click on a page you scroll through while reading.
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="rounded-xl border border-border bg-card/70 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        {/* Plain text, so it can be selected and read without side effects. */}
        <h2 className="min-w-0 truncate text-base font-medium">{title}</h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          // Names the ACTION, not just the section: a bare title collides with
          // content labels elsewhere on the page (战斗特性 is both a section and a
          // bracelet column), and "collapse X" is what the button actually does.
          aria-label={`${open ? '收起' : '展开'}${title}`}
          className="-mr-1 shrink-0 rounded p-1 text-sm text-muted-foreground transition-colors hover:bg-accent/20 hover:text-foreground"
        >
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open && <div className="space-y-2 border-t border-border px-4 py-3">{children}</div>}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  )
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <Field label={label}>
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          // Clamp rather than reject, so the field never deadlocks mid-edit.
          const raw = Number(e.target.value)
          const n = Number.isFinite(raw) ? raw : 0
          onChange(Math.min(max, Math.max(min, n)))
        }}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-right text-sm"
      />
    </Field>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-2 py-1 text-base"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
}
