import {
  Archive,
  ArchiveRestore,
  ArrowDownAZ,
  ChevronRight,
  FolderTree,
  List,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/utils'
import { useExpanded } from '@/hooks/useExpanded'
import { useSectionPrefs } from '@/hooks/useSectionPrefs'
import type { LiveSession, Project, SessionMeta, SessionSortBy } from '@/types'

type Variant = 'history' | 'archived'

type Props = {
  variant: Variant
  title: string
  projects: Project[]
  liveSessions: Map<string, LiveSession>
  activeSessionKey: string | null
  prefsKey: string
  defaultCollapsed?: boolean
  onResumeSession: (project: Project, session: SessionMeta) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (session: SessionMeta) => void
  renderState: (live: LiveSession | undefined) => React.ReactNode
}

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
  onResumeSession,
  onArchive,
  onUnarchive,
  onDelete,
  renderState,
}: Props) {
  const { isExpanded, toggle } = useExpanded()
  const { prefs, toggleGrouping, setSortBy } = useSectionPrefs(prefsKey)
  const [sectionOpen, setSectionOpen] = useState(!defaultCollapsed)

  const wantArchived = variant === 'archived'
  const filteredProjects = useMemo(() => {
    return projects
      .map((p) => ({
        ...p,
        sessions: p.sessions.filter((s) => s.archived === wantArchived),
      }))
      .filter((p) => p.sessions.length > 0)
  }, [projects, wantArchived])

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
          <span>{title}</span>
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
            const expanded = isExpanded(expandKey)
            return (
              <div key={p.slug} className="mb-2">
                <button
                  className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-semibold text-foreground hover:bg-accent cursor-pointer"
                  onClick={() => toggle(expandKey)}
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
                </button>
                {expanded ? (
                  <>
                    <div className="break-all px-2 pb-1 pl-6 font-mono text-[10px] text-muted-foreground/70">
                      {p.cwd}
                    </div>
                    <div className="flex flex-col gap-px pl-3.5">
                      {sessions.map((s) => (
                        <SessionRow
                          key={s.id}
                          project={p}
                          session={s}
                          live={liveSessions.get(s.id)}
                          active={s.id === activeSessionKey}
                          archived={wantArchived}
                          onResumeSession={onResumeSession}
                          onArchive={onArchive}
                          onUnarchive={onUnarchive}
                          onDelete={onDelete}
                          renderState={renderState}
                        />
                      ))}
                    </div>
                  </>
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
              archived={wantArchived}
              showProject
              onResumeSession={onResumeSession}
              onArchive={onArchive}
              onUnarchive={onUnarchive}
              onDelete={onDelete}
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
  archived: boolean
  showProject?: boolean
  onResumeSession: (project: Project, session: SessionMeta) => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onDelete: (session: SessionMeta) => void
  renderState: (live: LiveSession | undefined) => React.ReactNode
}

function SessionRow({
  project,
  session,
  live,
  active,
  archived,
  showProject,
  onResumeSession,
  onArchive,
  onUnarchive,
  onDelete,
  renderState,
}: RowProps) {
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
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
        {archived ? (
          <Tooltip content="Desarquivar">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onUnarchive(session.id)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label="Desarquivar"
            >
              <ArchiveRestore size={12} />
            </button>
          </Tooltip>
        ) : (
          <Tooltip content="Arquivar">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onArchive(session.id)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label="Arquivar"
            >
              <Archive size={12} />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Apagar definitivamente">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(session)
            }}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-300 cursor-pointer"
            aria-label="Apagar"
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
