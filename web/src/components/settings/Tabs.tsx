import type { ReactNode } from 'react'

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  rightSlot,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
  rightSlot?: ReactNode
}) {
  return (
    <div className="flex items-center border-b border-border bg-black/20">
      <div className="flex flex-1 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.id === active
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.id)}
              className={`cursor-pointer px-4 py-2 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-b-2 border-sky-500 text-foreground'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>
      {rightSlot ? <div className="shrink-0 px-3">{rightSlot}</div> : null}
    </div>
  )
}
