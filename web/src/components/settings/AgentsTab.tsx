import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import {
  type AgentDetail,
  type AgentScope,
  type AgentSummary,
  deleteAgent,
  fetchAgent,
  saveAgent,
  useAgentList,
  useKnownTools,
} from '@/hooks/useAgents'
import { useSaveStatus } from '@/hooks/useSaveStatus'
import { useSessionList } from '@/hooks/useSessionList'
import { Field, Section } from './atoms'

type Selection =
  | { mode: 'view'; scope: AgentScope; name: string }
  | { mode: 'new'; scope: AgentScope }
  | null

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

export function AgentsTab() {
  const { t } = useTranslation()
  const sessions = useSessionList()
  const projects = useMemo(
    () => [...sessions.projects].sort((a, b) => a.cwd.localeCompare(b.cwd)),
    [sessions.projects],
  )
  const [scope, setScope] = useState<AgentScope>('user')
  const [projectCwd, setProjectCwd] = useState<string | null>(null)
  const list = useAgentList(scope === 'project' ? projectCwd : null)
  const [selection, setSelection] = useState<Selection>(null)
  const [detail, setDetail] = useState<AgentDetail | null>(null)
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
    fetchAgent(selection.scope, selection.name, selection.scope === 'project' ? projectCwd : null)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((err) => {
        if (cancelled) return
        setDetailError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selection, projectCwd])

  const items: AgentSummary[] = scope === 'user' ? list.user : list.project
  const projectAvailable = scope !== 'project' || projectCwd != null

  const onSaved = async (saved: AgentDetail) => {
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
      <Section title={t('settings.agents.title')} description={t('settings.agents.help')}>
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
          <p className="text-xs text-muted-foreground">{t('settings.agents.noProjects')}</p>
        ) : projectAvailable ? (
          <AgentList
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
          title={
            selection.mode === 'new'
              ? t('settings.agents.newAgent')
              : t('settings.agents.editAgent', {
                  name: selection.mode === 'view' ? selection.name : '',
                })
          }
        >
          {selection.mode === 'view' && detailLoading ? (
            <p className="text-xs text-muted-foreground">{t('settings.agents.loading')}</p>
          ) : selection.mode === 'view' && detailError ? (
            <p className="text-xs text-red-400">
              {t('settings.agents.detailError', { error: detailError })}
            </p>
          ) : selection.mode === 'view' && detail ? (
            <AgentForm
              key={`${detail.path}`}
              initial={detail}
              scope={scope}
              cwd={scope === 'project' ? projectCwd : null}
              onSaved={onSaved}
              onDeleted={onDeleted}
              onCancel={() => setSelection(null)}
            />
          ) : selection.mode === 'new' ? (
            <AgentForm
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
  scope: AgentScope
  onScopeChange: (s: AgentScope) => void
  projects: { slug: string; cwd: string; cwdResolved: boolean }[]
  projectCwd: string | null
  onProjectChange: (cwd: string) => void
  projectsLoading: boolean
  projectsError: string | null
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label={t('settings.agents.scope')}>
        <div className="flex rounded border border-border overflow-hidden">
          {(['user', 'project'] as AgentScope[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onScopeChange(s)}
              className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
                scope === s
                  ? 'bg-sky-700 text-white'
                  : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'user' ? t('settings.agents.scopeUser') : t('settings.agents.scopeProject')}
            </button>
          ))}
        </div>
      </Field>

      {scope === 'project' ? (
        <Field label={t('settings.agents.project')}>
          {projectsLoading ? (
            <span className="text-xs text-muted-foreground">
              {t('settings.agents.loadingProjects')}
            </span>
          ) : projectsError ? (
            <span className="text-xs text-red-400">
              {t('settings.agents.projectsError', { error: projectsError })}
            </span>
          ) : (
            <select
              value={projectCwd ?? ''}
              onChange={(e) => onProjectChange(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.slug} value={p.cwd}>
                  {p.cwd}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
    </div>
  )
}

function AgentList({
  items,
  loading,
  error,
  selectedName,
  onSelect,
  onNew,
}: {
  items: AgentSummary[]
  loading: boolean
  error: string | null
  selectedName: string | null
  onSelect: (name: string) => void
  onNew: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {t('settings.agents.count', { count: items.length })}
        </span>
        <Button type="button" variant="primary" size="xs" onClick={onNew}>
          <Plus size={12} /> {t('settings.agents.newAgent')}
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">{t('settings.agents.loadingList')}</p>
      ) : error ? (
        <p className="text-xs text-red-400">{t('settings.agents.listError', { error })}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('settings.agents.emptyList')}</p>
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
                    <span className="line-clamp-2 text-[11px] text-muted-foreground">
                      {item.description}
                    </span>
                  ) : (
                    <span className="text-[11px] italic text-muted-foreground">
                      {t('settings.agents.noDescription')}
                    </span>
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

type AgentFormState = {
  name: string
  description: string
  model: string
  tools: string[]
  toolsAll: boolean
  body: string
}

function buildInitialState(initial: AgentDetail | null): AgentFormState {
  if (!initial) {
    return { name: '', description: '', model: '', tools: [], toolsAll: true, body: '' }
  }
  return {
    name: initial.name,
    description: initial.description,
    model: initial.model || '',
    tools: initial.tools,
    toolsAll: initial.tools.length === 0,
    body: initial.body,
  }
}

function AgentForm({
  initial,
  scope,
  cwd,
  onSaved,
  onDeleted,
  onCancel,
}: {
  initial: AgentDetail | null
  scope: AgentScope
  cwd: string | null
  onSaved: (data: AgentDetail) => void | Promise<void>
  onDeleted?: () => void | Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const knownTools = useKnownTools()
  const { setSaving: reportSaving, setSaved, setError: reportSaveError } = useSaveStatus()
  const [state, setState] = useState<AgentFormState>(() => buildInitialState(initial))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const lastSavedNameRef = useRef<string | null>(initial?.name ?? null)
  const lastSavedSnapshotRef = useRef<string>(JSON.stringify(buildInitialState(initial)))

  const isCreating = !initial

  const nameInvalid = !NAME_RE.test(state.name)
  const descriptionInvalid = !state.description.trim()
  const bodyInvalid = !state.body.trim()
  const canSave = !nameInvalid && !descriptionInvalid && !bodyInvalid && !saving

  const modelOptions: { value: string; label: string }[] = [
    { value: '', label: t('settings.agents.modelInherit') },
    { value: 'inherit', label: 'inherit' },
    { value: 'opus', label: 'opus' },
    { value: 'sonnet', label: 'sonnet' },
    { value: 'haiku', label: 'haiku' },
  ]

  const handleToggleTool = (tool: string, checked: boolean) => {
    setState((s) => {
      const set = new Set(s.tools)
      if (checked) set.add(tool)
      else set.delete(tool)
      return { ...s, tools: Array.from(set).sort() }
    })
  }

  // Auto-save (debounced) when editing an existing agent and form is valid.
  useEffect(() => {
    if (isCreating || !canSave) return
    const snapshot = JSON.stringify(state)
    if (snapshot === lastSavedSnapshotRef.current) return

    const handle = window.setTimeout(async () => {
      reportSaving()
      try {
        const saved = await saveAgent({
          scope,
          cwd,
          name: state.name,
          description: state.description.trim(),
          model: state.model,
          tools: state.toolsAll ? [] : state.tools,
          body: state.body,
          previousName: lastSavedNameRef.current,
        })
        lastSavedNameRef.current = saved.name
        lastSavedSnapshotRef.current = snapshot
        setError(null)
        await onSaved(saved)
        setSaved()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        reportSaveError(message)
      }
    }, 700)
    return () => window.clearTimeout(handle)
  }, [
    state,
    canSave,
    isCreating,
    scope,
    cwd,
    onSaved,
    reportSaving,
    setSaved,
    reportSaveError,
  ])

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    reportSaving()
    try {
      const saved = await saveAgent({
        scope,
        cwd,
        name: state.name,
        description: state.description.trim(),
        model: state.model,
        tools: state.toolsAll ? [] : state.tools,
        body: state.body,
        previousName: null,
      })
      lastSavedNameRef.current = saved.name
      lastSavedSnapshotRef.current = JSON.stringify(state)
      await onSaved(saved)
      setSaved()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      reportSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!initial) return
    setSaving(true)
    setError(null)
    try {
      await deleteAgent(scope, initial.name, cwd)
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

      <Field label={t('settings.agents.name')} required hint={t('settings.agents.nameHelp')}>
        <input
          type="text"
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value.trim() }))}
          placeholder={t('settings.agents.namePlaceholder')}
          className={`w-full rounded border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none ${
            state.name && nameInvalid
              ? 'border-red-500/60 focus:border-red-500'
              : 'border-border focus:border-sky-500'
          }`}
        />
      </Field>

      <Field
        label={t('settings.agents.description')}
        required
        hint={t('settings.agents.descriptionHelp')}
      >
        <textarea
          value={state.description}
          onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
          rows={3}
          placeholder={t('settings.agents.descriptionPlaceholder')}
          className={`w-full rounded border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none ${
            state.description && descriptionInvalid
              ? 'border-red-500/60 focus:border-red-500'
              : 'border-border focus:border-sky-500'
          }`}
        />
      </Field>

      <Field label={t('settings.agents.model')} hint={t('settings.agents.modelHelp')}>
        <select
          value={state.model}
          onChange={(e) => setState((s) => ({ ...s, model: e.target.value }))}
          className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
        >
          {modelOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={t('settings.agents.tools')}
        hint={state.toolsAll ? t('settings.agents.toolsAll') : t('settings.agents.toolsRestricted')}
      >
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded border border-border bg-background/40 px-3 py-1.5">
            <input
              type="checkbox"
              checked={state.toolsAll}
              onChange={(e) => setState((s) => ({ ...s, toolsAll: e.target.checked }))}
              className="h-4 w-4 cursor-pointer accent-sky-500"
            />
            <span className="text-xs text-foreground">{t('settings.agents.allTools')}</span>
          </label>
          {!state.toolsAll ? (
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {knownTools.map((tool) => (
                <label
                  key={tool}
                  className="flex cursor-pointer items-center gap-1.5 rounded border border-border bg-background/40 px-2 py-1"
                >
                  <input
                    type="checkbox"
                    checked={state.tools.includes(tool)}
                    onChange={(e) => handleToggleTool(tool, e.target.checked)}
                    className="h-3.5 w-3.5 cursor-pointer accent-sky-500"
                  />
                  <span className="font-mono text-[11px] text-foreground">{tool}</span>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </Field>

      <Field
        label={t('settings.agents.systemPrompt')}
        required
        hint={t('settings.agents.systemPromptHelp')}
      >
        <textarea
          value={state.body}
          onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
          spellCheck={false}
          rows={14}
          placeholder={t('settings.agents.systemPromptPlaceholder')}
          className={`w-full rounded border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none ${
            state.body && bodyInvalid
              ? 'border-red-500/60 focus:border-red-500'
              : 'border-border focus:border-sky-500'
          }`}
        />
      </Field>

      {error ? (
        <p className="text-xs text-red-400">{t('settings.agents.saveError', { error })}</p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          {!isCreating ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber-400">
                  {t('settings.agents.deletePrompt')}
                </span>
                <Button
                  type="button"
                  variant="warn"
                  size="xs"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  {t('common.confirm')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setConfirmDelete(false)}
                  disabled={saving}
                >
                  {t('settings.agents.cancel')}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setConfirmDelete(true)}
                disabled={saving}
              >
                <Trash2 size={12} /> {t('settings.agents.delete')}
              </Button>
            )
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={onCancel} disabled={saving}>
            {isCreating ? t('settings.agents.cancel') : t('common.close')}
          </Button>
          {isCreating ? (
            <Button
              type="button"
              variant="primary"
              size="xs"
              onClick={handleCreate}
              disabled={!canSave}
            >
              {saving ? t('settings.agents.saving') : t('settings.agents.create')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
