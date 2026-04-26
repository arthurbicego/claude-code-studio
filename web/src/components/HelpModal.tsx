import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { cn } from '@/lib/utils'

const SECTION_IDS = [
  'overview',
  'sessions',
  'panels',
  'worktrees',
  'memory',
  'agentsSkills',
  'sandbox',
  'settings',
] as const

type SectionId = (typeof SECTION_IDS)[number]

type Props = {
  open: boolean
  onClose: () => void
}

export function HelpModal({ open, onClose }: Props) {
  const { t } = useTranslation()
  const [active, setActive] = useState<SectionId>('overview')
  const contentRef = useRef<HTMLDivElement | null>(null)

  const sections = useMemo(
    () =>
      SECTION_IDS.map((id) => ({
        id,
        title: t(`help.sections.${id}.title`),
        body: t(`help.sections.${id}.body`),
      })),
    [t],
  )

  const goToSection = (id: SectionId) => {
    setActive(id)
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-section="${id}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Modal open={open} onClose={onClose} title={t('help.title')} size="lg">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <nav
          className="flex w-56 flex-col gap-1 overflow-y-auto border-r border-border bg-black/20 p-3"
          aria-label={t('help.tocLabel')}
        >
          <p className="px-2 pb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('help.tocLabel')}
          </p>
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goToSection(s.id)}
              className={cn(
                'rounded px-2 py-1.5 text-left text-xs cursor-pointer transition-colors',
                active === s.id
                  ? 'bg-sky-500/15 text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {s.title}
            </button>
          ))}
        </nav>
        <div
          ref={contentRef}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6 text-sm leading-relaxed text-foreground"
        >
          <header className="border-b border-border pb-4">
            <h3 className="text-lg font-semibold text-foreground">{t('help.title')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('help.subtitle')}</p>
          </header>
          {sections.map((s) => (
            <section key={s.id} data-section={s.id} className="flex flex-col gap-3">
              <h4 className="text-base font-semibold text-foreground">{s.title}</h4>
              <HelpBody body={s.body} />
            </section>
          ))}
        </div>
      </div>
    </Modal>
  )
}

function HelpBody({ body }: { body: string }) {
  const blocks = body.split('\n\n')
  return (
    <div className="flex flex-col gap-3 text-xs leading-relaxed text-muted-foreground">
      {blocks.map((block, idx) => {
        const trimmed = block.trim()
        if (!trimmed) return null
        const lines = trimmed.split('\n')
        const isList = lines.every((line) => line.startsWith('• ') || line.startsWith('  '))
        if (isList) {
          const items: string[] = []
          for (const line of lines) {
            if (line.startsWith('• ')) items.push(line.slice(2))
            else if (items.length > 0) items[items.length - 1] += `\n${line.trim()}`
          }
          return (
            <ul
              // biome-ignore lint/suspicious/noArrayIndexKey: stable order
              key={idx}
              className="ml-4 flex list-disc flex-col gap-1.5"
            >
              {items.map((item, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stable within block
                <li key={i}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable order
          <p key={idx}>{renderInline(trimmed)}</p>
        )
      })}
    </div>
  )
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable per render
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: stable per render
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}
