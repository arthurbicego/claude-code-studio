import type { ReactNode } from 'react'

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 p-4">
      <header className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h3>
        {description ? <p className="text-[11px] text-muted-foreground">{description}</p> : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Field is a helper that expects callers to pass the form control as `children` — the implicit <label> wrap associates it; Biome can't verify this statically
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="text-red-400"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded border border-border bg-background/40 px-3 py-2 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-xs text-foreground">{label}</span>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-sky-500"
      />
    </label>
  )
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded border border-border bg-background/40 px-3 py-1.5 ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-sky-500"
      />
      <span className="text-xs text-foreground">{label}</span>
    </label>
  )
}
