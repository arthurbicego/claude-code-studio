import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type MemoryHierarchyEntry,
  type MemoryVariant,
  useGlobalMemory,
  useMemoryHierarchy,
  useProjectMemory,
} from '@/hooks/useMemory'
import { useSessionList } from '@/hooks/useSessionList'
import type { Project } from '@/types'
import { Field, Section } from './atoms'
import { MemoryEditor } from './MemoryEditor'

function VariantTabs({
  value,
  onChange,
}: {
  value: MemoryVariant
  onChange: (v: MemoryVariant) => void
}) {
  const { t } = useTranslation()
  const options: { id: MemoryVariant; label: string; hint: string }[] = [
    {
      id: 'shared',
      label: t('settings.memory.variants.shared.title'),
      hint: t('settings.memory.variants.shared.help'),
    },
    {
      id: 'local',
      label: t('settings.memory.variants.local.title'),
      hint: t('settings.memory.variants.local.help'),
    },
  ]
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        {options.map((opt) => {
          const active = opt.id === value
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`cursor-pointer rounded border px-2 py-1 font-mono text-[11px] transition-colors ${
                active
                  ? 'border-sky-500 bg-sky-500/10 text-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <span className="text-[10px] text-muted-foreground">
        {options.find((o) => o.id === value)?.hint}
      </span>
    </div>
  )
}

function HierarchyRow({ entry, cwd }: { entry: MemoryHierarchyEntry; cwd: string }) {
  const { t } = useTranslation()
  const isProject = entry.scope === 'project'
  const scopeLabel =
    entry.scope === 'global'
      ? t('settings.memory.scope.global')
      : isProject
        ? t('settings.memory.scope.project')
        : t('settings.memory.scope.ancestor')
  const variantBadge = entry.variant === 'local' ? '.local' : ''
  const displayPath = isProject ? entry.path.replace(cwd, '.') : entry.path
  return (
    <li className="flex items-baseline gap-2 font-mono text-[10px]">
      <span
        className={`w-14 shrink-0 rounded px-1 py-0.5 text-center text-[9px] uppercase ${
          isProject
            ? 'bg-sky-500/20 text-sky-300'
            : entry.scope === 'global'
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-muted/40 text-muted-foreground'
        }`}
      >
        {scopeLabel}
        {variantBadge}
      </span>
      <span className="truncate text-muted-foreground" title={entry.path}>
        {displayPath}
      </span>
      <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">{entry.size}B</span>
    </li>
  )
}

function MemoryHierarchyView({ cwd }: { cwd: string }) {
  const { t } = useTranslation()
  const { entries, loading, error } = useMemoryHierarchy(cwd)
  const existing = entries.filter((e) => e.exists)

  if (loading) {
    return (
      <p className="text-[10px] text-muted-foreground">{t('settings.memory.loadingHierarchy')}</p>
    )
  }
  if (error) {
    return (
      <p className="text-[10px] text-red-400">{t('settings.memory.hierarchyError', { error })}</p>
    )
  }
  if (existing.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground">{t('settings.memory.hierarchyEmpty')}</p>
    )
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-black/10 p-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {t('settings.memory.hierarchyTitle')}
      </span>
      <ul className="flex flex-col gap-0.5">
        {existing.map((e) => (
          <HierarchyRow key={e.path} entry={e} cwd={cwd} />
        ))}
      </ul>
    </div>
  )
}

function ProjectPicker({
  projects,
  value,
  onChange,
}: {
  projects: Project[]
  value: string | null
  onChange: (cwd: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Field label={t('settings.memory.project')}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
      >
        {projects.map((p) => (
          <option key={p.slug} value={p.cwd}>
            {p.cwd}
            {p.cwdResolved ? '' : t('settings.memory.cwdInferred')}
          </option>
        ))}
      </select>
    </Field>
  )
}

function GlobalMemoryEditor() {
  const { t } = useTranslation()
  const memory = useGlobalMemory()
  return (
    <MemoryEditor
      data={memory.data}
      loading={memory.loading}
      loadError={memory.error}
      onSave={memory.save}
      onReload={memory.reload}
      placeholder={t('settings.memory.globalPlaceholder')}
    />
  )
}

function ProjectMemoryEditor({ project, variant }: { project: Project; variant: MemoryVariant }) {
  const { t } = useTranslation()
  const memory = useProjectMemory(project.cwd, variant)
  const placeholder =
    variant === 'local'
      ? t('settings.memory.localPlaceholder', { cwd: project.cwd })
      : t('settings.memory.sharedPlaceholder', { cwd: project.cwd })
  const hintParts: string[] = []
  if (!project.cwdResolved) {
    hintParts.push(t('settings.memory.cwdInferredWarn'))
  }
  if (variant === 'local') {
    hintParts.push(t('settings.memory.rememberGitignore'))
  }
  return (
    <MemoryEditor
      data={memory.data}
      loading={memory.loading}
      loadError={memory.error}
      onSave={memory.save}
      onReload={memory.reload}
      placeholder={placeholder}
      hint={hintParts.join(' ') || undefined}
    />
  )
}

export function MemoryTab() {
  const { t } = useTranslation()
  const sessions = useSessionList()
  const projects = useMemo(
    () => [...sessions.projects].sort((a, b) => a.cwd.localeCompare(b.cwd)),
    [sessions.projects],
  )
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null)
  const [variant, setVariant] = useState<MemoryVariant>('shared')

  useEffect(() => {
    if (selectedCwd) {
      if (!projects.some((p) => p.cwd === selectedCwd)) {
        setSelectedCwd(null)
      }
      return
    }
    if (projects.length > 0) {
      setSelectedCwd(projects[0].cwd)
    }
  }, [projects, selectedCwd])

  const selectedProject = projects.find((p) => p.cwd === selectedCwd) || null

  return (
    <>
      <Section
        title={t('settings.memory.globalTitle')}
        description={t('settings.memory.globalHelp')}
      >
        <GlobalMemoryEditor />
      </Section>

      <Section
        title={t('settings.memory.projectTitle')}
        description={t('settings.memory.projectHelp')}
      >
        {sessions.loading ? (
          <p className="text-xs text-muted-foreground">{t('settings.memory.loadingProjects')}</p>
        ) : sessions.error ? (
          <p className="text-xs text-red-400">
            {t('settings.memory.loadProjectsError', { error: sessions.error })}
          </p>
        ) : projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('settings.memory.noProjects')}</p>
        ) : (
          <>
            <ProjectPicker projects={projects} value={selectedCwd} onChange={setSelectedCwd} />
            {selectedProject ? (
              <>
                <MemoryHierarchyView cwd={selectedProject.cwd} />
                <VariantTabs value={variant} onChange={setVariant} />
                <ProjectMemoryEditor
                  key={`${selectedProject.cwd}:${variant}`}
                  project={selectedProject}
                  variant={variant}
                />
              </>
            ) : null}
          </>
        )}
      </Section>
    </>
  )
}
