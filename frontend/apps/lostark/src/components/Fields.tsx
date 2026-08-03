import type { ReactNode } from 'react'
import { useState } from 'react'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="rounded-xl border border-line bg-panel/70 backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="space-y-2 border-t border-line px-4 py-3">{children}</div>}
    </section>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-muted">{label}</span>
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
        className="w-full rounded-md border border-line bg-bg px-2 py-1 text-right text-sm"
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
        className="w-full rounded-md border border-line bg-bg px-2 py-1 text-sm"
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
