import { useEffect, useMemo, useState } from 'react'
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
  const options: { id: MemoryVariant; label: string; hint: string }[] = [
    { id: 'shared', label: 'CLAUDE.md', hint: 'Commitado — regras do time.' },
    { id: 'local', label: 'CLAUDE.local.md', hint: 'Gitignored — pessoal.' },
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
  const isProject = entry.scope === 'project'
  const scopeLabel = entry.scope === 'global' ? 'global' : isProject ? 'projeto' : 'ancestral'
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
  const { entries, loading, error } = useMemoryHierarchy(cwd)
  const existing = entries.filter((e) => e.exists)

  if (loading) {
    return <p className="text-[10px] text-muted-foreground">Carregando hierarquia…</p>
  }
  if (error) {
    return <p className="text-[10px] text-red-400">Erro na hierarquia: {error}</p>
  }
  if (existing.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground">
        Nenhum CLAUDE.md encontrado na cadeia (global + ancestrais + projeto).
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-border bg-black/10 p-2">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Arquivos carregados pelo CLI
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
  return (
    <Field label="Projeto">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
      >
        {projects.map((p) => (
          <option key={p.slug} value={p.cwd}>
            {p.cwd}
            {p.cwdResolved ? '' : ' (cwd inferido do slug)'}
          </option>
        ))}
      </select>
    </Field>
  )
}

function GlobalMemoryEditor() {
  const memory = useGlobalMemory()
  return (
    <MemoryEditor
      data={memory.data}
      loading={memory.loading}
      loadError={memory.error}
      onSave={memory.save}
      onReload={memory.reload}
      placeholder="# Instruções globais&#10;Adicione regras que valem para todas as sessões…"
    />
  )
}

function ProjectMemoryEditor({ project, variant }: { project: Project; variant: MemoryVariant }) {
  const memory = useProjectMemory(project.cwd, variant)
  const placeholder =
    variant === 'local'
      ? `# CLAUDE.local.md de ${project.cwd}\nPreferências pessoais (não commitadas)…`
      : `# CLAUDE.md de ${project.cwd}\nRegras que valem só para este projeto…`
  const hintParts: string[] = []
  if (!project.cwdResolved) {
    hintParts.push(
      'O cwd foi inferido do slug do projeto e pode não corresponder ao diretório real.',
    )
  }
  if (variant === 'local') {
    hintParts.push('Lembre de adicionar CLAUDE.local.md ao seu .gitignore.')
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
        // biome-ignore lint/correctness/useExhaustiveDependencies: sync selection with available projects
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
        title="Memória global"
        description="Arquivo ~/.claude/CLAUDE.md. Aplicado a todas as sessões deste usuário."
      >
        <GlobalMemoryEditor />
      </Section>

      <Section
        title="Memória por projeto"
        description="O Claude Code carrega CLAUDE.md (time, commitado) e CLAUDE.local.md (pessoal, gitignored) do cwd — e também dos diretórios pais até $HOME."
      >
        {sessions.loading ? (
          <p className="text-xs text-muted-foreground">Carregando projetos…</p>
        ) : sessions.error ? (
          <p className="text-xs text-red-400">Erro ao carregar projetos: {sessions.error}</p>
        ) : projects.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum projeto encontrado em ~/.claude/projects.
          </p>
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
