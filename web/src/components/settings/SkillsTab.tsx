import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSessionList } from '@/hooks/useSessionList'
import {
  deleteSkill,
  fetchSkill,
  saveSkill,
  useSkillList,
  type SkillDetail,
  type SkillScope,
  type SkillSummary,
} from '@/hooks/useSkills'
import { Field, Section } from './atoms'

type Selection =
  | { mode: 'view'; scope: SkillScope; name: string }
  | { mode: 'new'; scope: SkillScope }
  | null

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function SkillsTab() {
  const sessions = useSessionList()
  const projects = useMemo(
    () => [...sessions.projects].sort((a, b) => a.cwd.localeCompare(b.cwd)),
    [sessions.projects],
  )
  const [scope, setScope] = useState<SkillScope>('user')
  const [projectCwd, setProjectCwd] = useState<string | null>(null)
  const list = useSkillList(scope === 'project' ? projectCwd : null)
  const [selection, setSelection] = useState<Selection>(null)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    if (scope !== 'project') return
    if (!projectCwd && projects.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pick first project on entering project scope
      setProjectCwd(projects[0].cwd)
    }
  }, [scope, projectCwd, projects])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset selection when scope/project changes
    setSelection(null)
    setDetail(null)
    setDetailError(null)
  }, [scope, projectCwd])

  useEffect(() => {
    if (!selection || selection.mode !== 'view') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear detail when not viewing
      setDetail(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetailError(null)
    fetchSkill(selection.scope, selection.name, selection.scope === 'project' ? projectCwd : null)
      .then((data) => { if (!cancelled) setDetail(data) })
      .catch((err) => {
        if (cancelled) return
        setDetailError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => { if (!cancelled) setDetailLoading(false) })
    return () => { cancelled = true }
  }, [selection, projectCwd])

  const items: SkillSummary[] = scope === 'user' ? list.user : list.project
  const projectAvailable = scope !== 'project' || projectCwd != null

  const onSaved = async (saved: SkillDetail) => {
    await list.reload()
    setSelection({ mode: 'view', scope, name: saved.name })
    setDetail(saved)
  }

  const onDeleted = async () => {
    await list.reload()
    setSelection(null)
    setDetail(null)
  }

  return (
    <>
      <Section
        title="Skills"
        description="Instruções carregadas no contexto sob demanda. Cada skill é uma pasta com SKILL.md dentro."
      >
        <ScopePicker
          scope={scope}
          onScopeChange={setScope}
          projects={projects}
          projectCwd={projectCwd}
          onProjectChange={setProjectCwd}
          projectsLoading={sessions.loading}
          projectsError={sessions.error}
        />

        {scope === 'project' && projects.length === 0 && !sessions.loading ? (
          <p className="text-xs text-muted-foreground">Nenhum projeto encontrado.</p>
        ) : projectAvailable ? (
          <SkillList
            items={items}
            loading={list.loading}
            error={list.error}
            selectedName={selection?.mode === 'view' ? selection.name : null}
            onSelect={(name) => setSelection({ mode: 'view', scope, name })}
            onNew={() => setSelection({ mode: 'new', scope })}
          />
        ) : null}
      </Section>

      {selection ? (
        <Section
          title={selection.mode === 'new' ? 'Nova skill' : `Editar: ${selection.mode === 'view' ? selection.name : ''}`}
        >
          {selection.mode === 'view' && detailLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : selection.mode === 'view' && detailError ? (
            <p className="text-xs text-red-400">Erro: {detailError}</p>
          ) : selection.mode === 'view' && detail ? (
            <SkillForm
              key={detail.path}
              initial={detail}
              scope={scope}
              cwd={scope === 'project' ? projectCwd : null}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onCancel={() => setSelection(null)}
            />
          ) : selection.mode === 'new' ? (
            <SkillForm
              key="new"
              initial={null}
              scope={scope}
              cwd={scope === 'project' ? projectCwd : null}
              onSaved={onSaved}
              onCancel={() => setSelection(null)}
            />
          ) : null}
        </Section>
      ) : null}
    </>
  )
}

function ScopePicker({
  scope,
  onScopeChange,
  projects,
  projectCwd,
  onProjectChange,
  projectsLoading,
  projectsError,
}: {
  scope: SkillScope
  onScopeChange: (s: SkillScope) => void
  projects: { slug: string; cwd: string; cwdResolved: boolean }[]
  projectCwd: string | null
  onProjectChange: (cwd: string) => void
  projectsLoading: boolean
  projectsError: string | null
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Escopo">
        <div className="flex rounded border border-border overflow-hidden">
          {(['user', 'project'] as SkillScope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onScopeChange(s)}
              className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === s ? 'bg-sky-700 text-white' : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'user' ? 'User (~/.claude)' : 'Projeto'}
            </button>
          ))}
        </div>
      </Field>

      {scope === 'project' ? (
        <Field label="Projeto">
          {projectsLoading ? (
            <span className="text-xs text-muted-foreground">Carregando projetos…</span>
          ) : projectsError ? (
            <span className="text-xs text-red-400">Erro: {projectsError}</span>
          ) : (
            <select
              value={projectCwd ?? ''}
              onChange={(e) => onProjectChange(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.slug} value={p.cwd}>{p.cwd}</option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
    </div>
  )
}

function SkillList({
  items,
  loading,
  error,
  selectedName,
  onSelect,
  onNew,
}: {
  items: SkillSummary[]
  loading: boolean
  error: string | null
  selectedName: string | null
  onSelect: (name: string) => void
  onNew: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {items.length} skill{items.length === 1 ? '' : 's'}
        </span>
        <Button type="button" variant="primary" size="xs" onClick={onNew}>
          <Plus size={12} /> Nova skill
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : error ? (
        <p className="text-xs text-red-400">Erro: {error}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma skill neste escopo.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const isSelected = item.name === selectedName
            return (
              <li key={item.name}>
                <button
                  type="button"
                  onClick={() => onSelect(item.name)}
                  className={`flex w-full flex-col gap-0.5 rounded border px-3 py-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-sky-500/60 bg-sky-500/10'
                      : 'border-border bg-background/40 hover:bg-background/70'
                  }`}
                >
                  <span className="text-xs font-medium text-foreground">{item.name}</span>
                  {item.description ? (
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">{item.description}</span>
                  ) : (
                    <span className="text-[11px] italic text-muted-foreground">sem description</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

type SkillFormState = {
  name: string
  description: string
  body: string
}

function buildInitialState(initial: SkillDetail | null): SkillFormState {
  if (!initial) return { name: '', description: '', body: '' }
  return { name: initial.name, description: initial.description, body: initial.body }
}

function SkillForm({
  initial,
  scope,
  cwd,
  onSaved,
  onDeleted,
  onCancel,
}: {
  initial: SkillDetail | null
  scope: SkillScope
  cwd: string | null
  onSaved: (data: SkillDetail) => void | Promise<void>
  onDeleted?: () => void | Promise<void>
  onCancel: () => void
}) {
  const [state, setState] = useState<SkillFormState>(() => buildInitialState(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isCreating = !initial
  const nameInvalid = !NAME_RE.test(state.name)
  const descriptionInvalid = !state.description.trim()
  const bodyInvalid = !state.body.trim()
  const canSave = !nameInvalid && !descriptionInvalid && !bodyInvalid && !saving

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = await saveSkill({
        scope,
        cwd,
        name: state.name,
        description: state.description.trim(),
        body: state.body,
        previousName: initial?.name ?? null,
      })
      await onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!initial) return
    setSaving(true)
    setError(null)
    try {
      await deleteSkill(scope, initial.name, cwd)
      await onDeleted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {initial?.path ? (
        <p className="font-mono text-[10px] text-muted-foreground">{initial.path}</p>
      ) : null}

      <Field label="Nome" required hint="a-z, 0-9 e hífens. Vai virar o nome da pasta.">
        <input
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value.trim() }))}
          placeholder="ex.: code-quality-check"
          className={`w-full rounded border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none ${
            state.name && nameInvalid ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-sky-500'
          }`}
        />
      </Field>

      <Field
        label="Description"
        required
        hint="Como o Claude decide se carrega esta skill. Foque no gatilho ('use quando…')."
      >
        <textarea
          value={state.description}
          onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
          rows={3}
          placeholder="Use esta skill quando…"
          className={`w-full rounded border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none ${
            state.description && descriptionInvalid ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-sky-500'
          }`}
        />
      </Field>

      <Field
        label="Conteúdo (SKILL.md)"
        required
        hint="Markdown. Pode referenciar outros arquivos da pasta."
      >
        <textarea
          value={state.body}
          onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
          spellCheck={false}
          rows={14}
          placeholder="## Quando usar&#10;...&#10;&#10;## Como usar&#10;..."
          className={`w-full rounded border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none ${
            state.body && bodyInvalid ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-sky-500'
          }`}
        />
      </Field>

      {initial && initial.extras.length > 0 ? (
        <div className="rounded border border-border bg-background/40 p-3">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
            Outros arquivos da pasta (read-only)
          </p>
          <ul className="flex flex-col gap-1">
            {initial.extras.map((extra) => (
              <li key={extra.relativePath} className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
                <span>{extra.relativePath}</span>
                <span>{extra.size} B</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Edite estes arquivos diretamente em <span className="font-mono">{initial.dir}</span>.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-400">Erro: {error}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          {!isCreating ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-400">
                  Apagar a pasta inteira da skill?
                </span>
                <Button type="button" variant="warn" size="xs" onClick={handleDelete} disabled={saving}>
                  Confirmar
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmDelete(false)} disabled={saving}>
                  Cancelar
                </Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="xs" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 size={12} /> Apagar
              </Button>
            )
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" size="xs" onClick={handleSave} disabled={!canSave}>
            {saving ? 'Salvando…' : isCreating ? 'Criar skill' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
