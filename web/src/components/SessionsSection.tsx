import { PROJECT_SORT_OPTIONS, SESSION_SORT_OPTIONS } from '@shared/types'
import type { TFunction } from 'i18next'
import {
  Archive,
  ArchiveRestore,
  ArrowDownAZ,
  ChevronRight,
  FolderCode,
  FolderTree,
  List,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyableField } from '@/components/ui/CopyableField'
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Tooltip } from '@/components/ui/Tooltip'
import { useExpanded } from '@/hooks/useExpanded'
import { useFormatDate } from '@/hooks/useFormatDate'
import { usePrefs } from '@/hooks/usePrefs'
import { useSectionPrefs } from '@/hooks/useSectionPrefs'
import { cn } from '@/lib/utils'
import type {
  LiveSession,
  Project,
  ProjectSortBy,
  SessionLaunch,
  SessionMeta,
  SessionSortBy,
} from '@/types'

const DEFAULT_SESSION_SORT: SessionSortBy = 'lastResponse'

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
  onOpenProjectInVSCode: (project: Project) => void
  onArchiveProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
  renderState: (live: LiveSession | undefined) => React.ReactNode
  applyProjectOrder: <T extends { slug: string }>(items: T[]) => T[]
  onReorderProject: (fromSlug: string, toSlug: string, position: 'before' | 'after') => void
  searchQuery?: string
}

function matchesQuery(s: SessionMeta, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (s.id.toLowerCase().includes(q)) return true
  if (s.preview && s.preview.toLowerCase().includes(q)) return true
  return false
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
    return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine
  }
  return s.id.slice(0, 8)
}

function alphabeticalKey(s: SessionMeta): string {
  const line = (s.preview ?? '').split('\n')[0].trim().toLowerCase()
  return line || s.id
}

function sortSessions(list: SessionMeta[], by: SessionSortBy): SessionMeta[] {
  if (by === 'alphabetical') {
    return [...list].sort((a, b) => alphabeticalKey(a).localeCompare(alphabeticalKey(b)))
  }
  const key = by === 'createdAt' ? 'createdAt' : 'mtime'
  return [...list].sort((a, b) => b[key] - a[key])
}

function projectLastActivity(p: Project): number {
  let max = 0
  for (const s of p.sessions) if (s.mtime > max) max = s.mtime
  return max
}

function projectCreatedAt(p: Project): number {
  let max = 0
  for (const s of p.sessions) if (s.createdAt > max) max = s.createdAt
  return max
}

function sortProjects<T extends Project>(
  list: T[],
  by: ProjectSortBy | null,
  applyCustomOrder: <U extends { slug: string }>(items: U[]) => U[],
): T[] {
  if (by === null) return applyCustomOrder(list)
  if (by === 'alphabetical') {
    return [...list].sort((a, b) =>
      basename(a.cwd).toLowerCase().localeCompare(basename(b.cwd).toLowerCase()),
    )
  }
  if (by === 'lastActivity') {
    return [...list].sort((a, b) => projectLastActivity(b) - projectLastActivity(a))
  }
  return [...list].sort((a, b) => projectCreatedAt(b) - projectCreatedAt(a))
}

function sessionSortLabel(t: TFunction, by: SessionSortBy): string {
  return t(`sessions.sortLabel.${by}`)
}

function projectSortTooltipLabel(t: TFunction, by: ProjectSortBy | null): string {
  return by === null ? t('sessions.projectSortLabel.custom') : t(`sessions.projectSortLabel.${by}`)
}

function buildProjectSortMenuItems(
  t: TFunction,
  current: ProjectSortBy | null,
  onSelect: (next: ProjectSortBy) => void,
): DropdownMenuItem[] {
  return PROJECT_SORT_OPTIONS.map((option) => ({
    label: t(`sessions.projectSortLabel.${option}`),
    checked: current === option,
    onSelect: () => onSelect(option),
  }))
}

function buildSessionSortMenuItems(
  t: TFunction,
  current: SessionSortBy,
  onSelect: (next: SessionSortBy) => void,
): DropdownMenuItem[] {
  return SESSION_SORT_OPTIONS.map((option) => ({
    label: sessionSortLabel(t, option),
    checked: current === option,
    onSelect: () => onSelect(option),
  }))
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
  onOpenProjectInVSCode,
  onArchiveProject,
  onDeleteProject,
  renderState,
  applyProjectOrder,
  onReorderProject,
  searchQuery,
}: Props) {
  const { t } = useTranslation()
  const { isExpanded, toggle } = useExpanded()
  const { prefs, toggleGrouping, setProjectSortBy } = useSectionPrefs(prefsKey)
  const { prefs: globalPrefs, setSessionSortForProject } = usePrefs()
  const sessionSortByProject = globalPrefs.sessionSortByProject
  const projectSortBy = prefs.projectSortBy
  const [sectionOpen, setSectionOpen] = useState(!defaultCollapsed)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const isSearching = !!searchQuery && searchQuery.length > 0
  const groupsExpandedByDefault = variant === 'open' || isSearching

  const filteredProjects = useMemo(() => {
    const sessionFilter = (s: SessionMeta) => {
      const isOpen = openSessionKeys?.has(s.id) ?? false
      if (variant === 'archived' && !s.archived) return false
      if (variant === 'archived' && isOpen) return false
      if (variant === 'open' && !isOpen) return false
      if (variant === 'history' && (s.archived || isOpen)) return false
      if (searchQuery && !matchesQuery(s, searchQuery)) return false
      return true
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
        if (searchQuery && !matchesQuery(synthSession, searchQuery)) continue
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

    return sortProjects(filtered, projectSortBy, applyProjectOrder)
  }, [
    variant,
    projects,
    openSessionKeys,
    openLaunches,
    applyProjectOrder,
    searchQuery,
    projectSortBy,
  ])

  const flat = useMemo(() => {
    const out: { project: Project; session: SessionMeta }[] = []
    for (const p of filteredProjects) {
      const sort = sessionSortByProject[p.slug] ?? DEFAULT_SESSION_SORT
      for (const s of sortSessions(p.sessions, sort)) out.push({ project: p, session: s })
    }
    return out
  }, [filteredProjects, sessionSortByProject])

  const total = flat.length

  if (isSearching && total === 0) return null

  const effectiveSectionOpen = isSearching ? true : sectionOpen

  return (
    <section className="mb-3">
      <div className="flex items-center gap-1 px-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={() => setSectionOpen((v) => !v)}
        >
          <ChevronRight
            size={10}
            className={cn('transition-transform', effectiveSectionOpen && 'rotate-90')}
          />
          <span className="flex-1">{title}</span>
          <Tooltip content={t('sessions.count', { count: total })}>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium normal-case text-muted-foreground">
              {total}
            </span>
          </Tooltip>
        </button>
        {effectiveSectionOpen ? (
          <>
            <Tooltip
              content={prefs.groupByProject ? t('sessions.groupOn') : t('sessions.groupOff')}
            >
              <button
                type="button"
                onClick={toggleGrouping}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
                aria-label={t('sessions.toggleGrouping')}
              >
                {prefs.groupByProject ? <FolderTree size={12} /> : <List size={12} />}
              </button>
            </Tooltip>
            <DropdownMenu
              triggerIcon={ArrowDownAZ}
              items={buildProjectSortMenuItems(t, projectSortBy, setProjectSortBy)}
              ariaLabel={t('sessions.sortMenu')}
              tooltip={t('sessions.sortBy', {
                label: projectSortTooltipLabel(t, projectSortBy),
              })}
            />
          </>
        ) : null}
      </div>

      {!effectiveSectionOpen ? null : total === 0 ? (
        <p className="px-2 py-2 text-xs text-muted-foreground">{t('common.empty')}</p>
      ) : prefs.groupByProject ? (
        <div className="mt-1">
          {filteredProjects.map((p) => {
            const effectiveSort = sessionSortByProject[p.slug] ?? DEFAULT_SESSION_SORT
            const sessions = sortSessions(p.sessions, effectiveSort)
            const expandKey = `${prefsKey}:${p.slug}`
            const explicit = isExpanded(expandKey)
            const expanded = groupsExpandedByDefault ? !explicit : explicit
            const showBefore = dropTarget?.slug === p.slug && dropTarget.position === 'before'
            const showAfter = dropTarget?.slug === p.slug && dropTarget.position === 'after'
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
                    setProjectSortBy(null)
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
                  <Tooltip content={t('sessions.count', { count: sessions.length })}>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {sessions.length}
                    </span>
                  </Tooltip>
                  <PathPopover path={p.cwd} />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    role="presentation"
                    className="flex items-center"
                  >
                    <DropdownMenu
                      triggerIcon={ArrowDownAZ}
                      items={buildSessionSortMenuItems(t, effectiveSort, (next) =>
                        setSessionSortForProject(p.slug, next),
                      )}
                      ariaLabel={t('sessions.project.sortMenu')}
                      tooltip={t('sessions.project.sortBy', {
                        label: sessionSortLabel(t, effectiveSort),
                      })}
                    />
                    <DropdownMenu
                      items={[
                        {
                          label: t('sessions.project.openInVscode'),
                          icon: FolderCode,
                          onSelect: () => onOpenProjectInVSCode(p),
                        },
                        {
                          label: t('sessions.project.archiveAll'),
                          icon: Archive,
                          onSelect: () => onArchiveProject(p),
                        },
                        {
                          label: t('sessions.project.deleteAll'),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => onDeleteProject(p),
                        },
                      ]}
                      ariaLabel={t('sessions.project.actions')}
                      tooltip={t('sessions.project.actions')}
                    />
                  </div>
                </div>
                {expanded ? (
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
  const { t } = useTranslation()
  const formatDate = useFormatDate()
  const isArchived = variant === 'archived'
  const isOpen = variant === 'open'
  const menuItems: DropdownMenuItem[] = [
    isArchived
      ? {
          label: t('sessions.actions.unarchive'),
          icon: ArchiveRestore,
          onSelect: () => onUnarchive(session.id),
        }
      : {
          label: t('sessions.actions.archive'),
          icon: Archive,
          onSelect: () => onArchive(session.id),
        },
    {
      label: t('sessions.actions.delete'),
      icon: Trash2,
      destructive: true,
      onSelect: () => onDelete(session),
    },
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
        type="button"
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
          {formatDate(session.mtime)}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
        {isOpen && onCloseSession ? (
          <Tooltip content={t('sessions.actions.close')}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCloseSession(session.id)
              }}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
              aria-label={t('sessions.actions.close')}
            >
              <X size={12} />
            </button>
          </Tooltip>
        ) : null}
        <DropdownMenu
          items={menuItems}
          ariaLabel={t('sessions.actions.title')}
          tooltip={t('sessions.actions.title')}
        />
      </div>
    </div>
  )
}

function PathPopover({ path }: { path: string }) {
  const { t } = useTranslation()
  return (
    <InfoPopover ariaLabel={t('sessions.project.showPath')} tooltip={t('sessions.project.path')}>
      <CopyableField
        label={t('sessions.project.path')}
        value={path}
        copyAriaLabel={t('sessions.project.copyPath')}
      />
    </InfoPopover>
  )
}
