import { ArrowDownAZ, ChevronRight, FolderTree, List, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CopyableField } from '@/components/ui/CopyableField'
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import { useExpanded } from '@/hooks/useExpanded'
import { useSectionPrefs } from '@/hooks/useSectionPrefs'
import type { LiveSession, Project, SessionLaunch, SessionMeta, SessionSortBy } from '@/types'

type Variant = 'history' | 'archived' | 'open'

type Props = {
  variant: Variant
  title: string
  projects: Project[]
  liveSessions: Map<string, LiveSession>
  activeSessionKey: string | null
  prefsKey: string
  defaultCollapsed?: boolean
  openSessionKeys?: Set<string>
  openLaunches?: Map<string, SessionLaunch>
  onResumeSession: (project: Project, session: SessionMeta) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (session: SessionMeta) => void
  onCloseSession?: (sessionKey: string) => void
  renderState: (live: LiveSession | undefined) => React.ReactNode
  applyProjectOrder: <T extends { slug: string }>(items: T[]) => T[]
  onReorderProject: (fromSlug: string, toSlug: string, position: 'before' | 'after') => void
}

type DropTarget = { slug: string; position: 'before' | 'after' }

const DRAG_MIME = 'application/x-claude-code-studio-project-slug'

function basename(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] || cwd
}

function formatPreview(s: SessionMeta): string {
  if (s.preview) {
    const firstLine = s.preview.split('\n')[0].trim()
    return firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine
  }
  return s.id.slice(0, 8)
}

function sortSessions(list: SessionMeta[], by: SessionSortBy): SessionMeta[] {
  const key = by === 'createdAt' ? 'createdAt' : 'mtime'
  return [...list].sort((a, b) => b[key] - a[key])
}

function nextSort(by: SessionSortBy): SessionSortBy {
  return by === 'lastResponse' ? 'createdAt' : 'lastResponse'
}

function sortLabel(by: SessionSortBy): string {
  return by === 'lastResponse' ? 'Última resposta' : 'Data de criação'
}

export function SessionsSection({
  variant,
  title,
  projects,
  liveSessions,
  activeSessionKey,
  prefsKey,
  defaultCollapsed = false,
  openSessionKeys,
  openLaunches,
  onResumeSession,
  onArchive,
  onUnarchive,
  onDelete,
  onCloseSession,
  renderState,
  applyProjectOrder,
  onReorderProject,
}: Props) {
  const { isExpanded, toggle } = useExpanded()
  const { prefs, toggleGrouping, setSortBy } = useSectionPrefs(prefsKey)
  const [sectionOpen, setSectionOpen] = useState(!defaultCollapsed)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const groupsExpandedByDefault = variant === 'open'

  const filteredProjects = useMemo(() => {
    const sessionFilter = (s: SessionMeta) => {
      const isOpen = openSessionKeys?.has(s.id) ?? false
      if (variant === 'archived') return s.archived && !isOpen
      if (variant === 'open') return isOpen
      return !s.archived && !isOpen
    }
    const filtered = projects
      .map((p) => ({
        ...p,
        sessions: p.sessions.filter(sessionFilter),
      }))
      .filter((p) => p.sessions.length > 0)

    if (variant === 'open' && openLaunches) {
      const knownIds = new Set<string>()
      for (const p of filtered) for (const s of p.sessions) knownIds.add(s.id)
      const orphans: { project: Project; session: SessionMeta }[] = []
      for (const launch of openLaunches.values()) {
        if (knownIds.has(launch.sessionKey)) continue
        const synthSession: SessionMeta = {
          id: launch.sessionKey,
          mtime: Date.now(),
          createdAt: Date.now(),
          size: 0,
          preview: launch.label ?? null,
          archived: false,
        }
        const matchByCwd = projects.find((p) => p.cwd === launch.cwd)
        if (matchByCwd) {
          const existing = filtered.find((p) => p.slug === matchByCwd.slug)
          if (existing) {
            existing.sessions = [...existing.sessions, synthSession]
          } else {
            filtered.push({ ...matchByCwd, sessions: [synthSession] })
          }
        } else {
          orphans.push({
            project: {
              slug: `__synth_${launch.sessionKey}`,
              cwd: launch.cwd,
              cwdResolved: false,
              sessions: [synthSession],
            },
            session: synthSession,
          })
        }
      }
      for (const { project } of orphans) filtered.push(project)
    }

    return applyProjectOrder(filtered)
  }, [variant, projects, openSessionKeys, openLaunches, applyProjectOrder])

  const flat = useMemo(() => {
    const out: { project: Project; session: SessionMeta }[] = []
    for (const p of filteredProjects) {
      for (const s of p.sessions) out.push({ project: p, session: s })
    }
    return out.sort((a, b) => {
      const k: keyof SessionMeta = prefs.sortBy === 'createdAt' ? 'createdAt' : 'mtime'
      return b.session[k] - a.session[k]
    })
  }, [filteredProjects, prefs.sortBy])

  const total = flat.length

  return (
    <section className="mb-3">
      <div className="flex items-center gap-1 px-2">
        <button
          className="flex flex-1 items-center gap-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => setSectionOpen((v) => !v)}
        >
          <ChevronRight
            size={10}
            className={cn('transition-transform', sectionOpen && 'rotate-90')}
          />
          <span className="flex-1">{title}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium normal-case text-muted-foreground">
            {total}
          </span>
        </button>
        {sectionOpen ? (
          <>
            <Tooltip
              content={prefs.groupByProject ? 'Listar sem agrupar' : 'Agrupar por projeto'}
            >
              <button
                onClick={toggleGrouping}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label="Alternar agrupamento"
              >
                {prefs.groupByProject ? <FolderTree size={12} /> : <List size={12} />}
              </button>
            </Tooltip>
            <Tooltip content={`Ordenar por: ${sortLabel(prefs.sortBy)}`}>
              <button
                onClick={() => setSortBy(nextSort(prefs.sortBy))}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label="Alternar ordenação"
              >
                <ArrowDownAZ size={12} />
              </button>
            </Tooltip>
          </>
        ) : null}
      </div>

      {!sectionOpen ? null : total === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">Vazio.</p>
      ) : prefs.groupByProject ? (
        <div className="mt-1">
          {filteredProjects.map((p) => {
            const sessions = sortSessions(p.sessions, prefs.sortBy)
            const expandKey = `${prefsKey}:${p.slug}`
            const explicit = isExpanded(expandKey)
            const expanded = groupsExpandedByDefault ? !explicit : explicit
            const showBefore =
              dropTarget?.slug === p.slug && dropTarget.position === 'before'
            const showAfter =
              dropTarget?.slug === p.slug && dropTarget.position === 'after'
            return (
              <div key={p.slug} className="relative mb-2">
                {showBefore ? (
                  <div className="pointer-events-none absolute inset-x-0 -top-1 h-0.5 rounded bg-sky-500" />
                ) : null}
                <div
                  role="button"
                  tabIndex={0}
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-accent cursor-pointer active:cursor-grabbing"
                  onClick={() => toggle(expandKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggle(expandKey)
                    }
                  }}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, p.slug)
                    e.dataTransfer.effectAllowed = 'move'
                    setDropTarget(null)
                  }}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(DRAG_MIME)) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    const rect = e.currentTarget.getBoundingClientRect()
                    const position: 'before' | 'after' =
                      e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                    setDropTarget((prev) =>
                      prev && prev.slug === p.slug && prev.position === position
                        ? prev
                        : { slug: p.slug, position },
                    )
                  }}
                  onDragEnd={() => setDropTarget(null)}
                  onDrop={(e) => {
                    const from = e.dataTransfer.getData(DRAG_MIME)
                    const rect = e.currentTarget.getBoundingClientRect()
                    const position: 'before' | 'after' =
                      e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                    setDropTarget(null)
                    if (!from || from === p.slug) return
                    e.preventDefault()
                    onReorderProject(from, p.slug, position)
                  }}
                >
                  <ChevronRight
                    size={12}
                    className={cn(
                      'text-muted-foreground transition-transform',
                      expanded && 'rotate-90',
                    )}
                  />
                  <span className="flex-1 truncate">{basename(p.cwd)}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {sessions.length}
                  </span>
                  <PathPopover path={p.cwd} />
                </div>
                {expanded ? (
                  <>
                    <div className="flex flex-col gap-px pl-3.5">
                      {sessions.map((s) => (
                        <SessionRow
                          key={s.id}
                          project={p}
                          session={s}
                          live={liveSessions.get(s.id)}
                          active={s.id === activeSessionKey}
                          variant={variant}
                          onResumeSession={onResumeSession}
                          onArchive={onArchive}
                          onUnarchive={onUnarchive}
                          onDelete={onDelete}
                          onCloseSession={onCloseSession}
                          renderState={renderState}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
                {showAfter ? (
                  <div className="pointer-events-none absolute inset-x-0 -bottom-1 h-0.5 rounded bg-sky-500" />
                ) : null}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-px">
          {flat.map(({ project, session }) => (
            <SessionRow
              key={session.id}
              project={project}
              session={session}
              live={liveSessions.get(session.id)}
              active={session.id === activeSessionKey}
              variant={variant}
              showProject
              onResumeSession={onResumeSession}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onDelete={onDelete}
              onCloseSession={onCloseSession}
              renderState={renderState}
            />
          ))}
        </div>
      )}
    </section>
  )
}

type RowProps = {
  project: Project
  session: SessionMeta
  live: LiveSession | undefined
  active: boolean
  variant: Variant
  showProject?: boolean
  onResumeSession: (project: Project, session: SessionMeta) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (session: SessionMeta) => void
  onCloseSession?: (sessionKey: string) => void
  renderState: (live: LiveSession | undefined) => React.ReactNode
}

function SessionRow({
  project,
  session,
  live,
  active,
  variant,
  showProject,
  onResumeSession,
  onArchive,
  onUnarchive,
  onDelete,
  onCloseSession,
  renderState,
}: RowProps) {
  const isArchived = variant === 'archived'
  const isOpen = variant === 'open'
  const menuItems: DropdownMenuItem[] = [
    isArchived
      ? { label: 'Desarquivar', onSelect: () => onUnarchive(session.id) }
      : { label: 'Arquivar', onSelect: () => onArchive(session.id) },
    { label: 'Apagar', destructive: true, onSelect: () => onDelete(session) },
  ]
  return (
    <div
      className={cn(
        'group/row flex items-start gap-2 rounded border-l-2 border-transparent px-2 py-1.5 text-xs',
        active
          ? 'border-sky-500 bg-sky-900/30 text-foreground'
          : 'text-muted-foreground hover:bg-accent/60',
      )}
    >
      <span className="pt-0.5">{renderState(live)}</span>
      <button
        onClick={() => onResumeSession(project, session)}
        className="flex min-w-0 flex-1 flex-col text-left cursor-pointer"
      >
        <span className="line-clamp-2 leading-snug">{formatPreview(session)}</span>
        {showProject ? (
          <span className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/60">
            {basename(project.cwd)}
          </span>
        ) : null}
        <span className="mt-1 font-mono text-[10px] text-muted-foreground/60">
          {new Date(session.mtime).toLocaleString('pt-BR')}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
        {isOpen && onCloseSession ? (
          <Tooltip content="Fechar sessão">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCloseSession(session.id)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label="Fechar sessão"
            >
              <X size={12} />
            </button>
          </Tooltip>
        ) : null}
        <DropdownMenu items={menuItems} ariaLabel="Ações da sessão" />
      </div>
    </div>
  )
}

function PathPopover({ path }: { path: string }) {
  return (
    <InfoPopover ariaLabel="Mostrar caminho do projeto">
      <CopyableField
        label="Caminho do projeto"
        value={path}
        copyAriaLabel="Copiar caminho do projeto"
      />
    </InfoPopover>
  )
}
