import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useConfig } from '@/hooks/useConfig'
import { useClaudeSettings } from '@/hooks/useClaudeSettings'
import {
  expandMemoryImports,
  useGlobalMemory,
  useMemoryHierarchy,
  useProjectMemory,
  type ExpandResult,
  type MemoryFile,
  type MemoryHierarchyEntry,
  type MemoryVariant,
} from '@/hooks/useMemory'
import { useSessionList } from '@/hooks/useSessionList'
import { AgentsTab } from '@/components/settings/AgentsTab'
import { SkillsTab } from '@/components/settings/SkillsTab'
import type { Project, SandboxPlatform, SandboxScope, SandboxSettings } from '@/types'

type TabId = 'sessions' | 'sandbox' | 'memory' | 'agents' | 'skills'

type StandbyUnit = 'seconds' | 'minutes'

const STANDBY_UNIT_OPTIONS: { id: StandbyUnit; label: string }[] = [
  { id: 'seconds', label: 'Segundos' },
  { id: 'minutes', label: 'Minutos' },
]

type JsonFieldState = {
  text: string
  error: string | null
}

const PLATFORM_OPTIONS: { id: SandboxPlatform; label: string }[] = [
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
]

const JSON_FIELDS = ['network', 'filesystem', 'ripgrep', 'seccomp'] as const
type JsonFieldKey = (typeof JSON_FIELDS)[number]

const SCOPE_OPTIONS: { id: SandboxScope; label: string; hint: string }[] = [
  {
    id: 'user',
    label: 'User',
    hint: '~/.claude/settings.json — vale para todos os projetos deste usuário.',
  },
  {
    id: 'user-local',
    label: 'User local',
    hint: '~/.claude/settings.local.json — só este usuário, não commitado.',
  },
  {
    id: 'project',
    label: 'Projeto',
    hint: '<cwd>/.claude/settings.json — compartilhado com o time (commitável).',
  },
  {
    id: 'project-local',
    label: 'Projeto local',
    hint: '<cwd>/.claude/settings.local.json — só este projeto, gitignored.',
  },
]

function scopeNeedsProject(scope: SandboxScope): boolean {
  return scope === 'project' || scope === 'project-local'
}

const JSON_FIELD_META: Record<JsonFieldKey, { title: string; description: string; linuxOnly?: boolean }> = {
  network: {
    title: 'Rede',
    description: 'Regras de allow/deny para hosts e portas. Estrutura aceita pelo runtime do sandbox.',
  },
  filesystem: {
    title: 'Sistema de arquivos',
    description: 'Permissões de leitura/escrita em diretórios. Estrutura aceita pelo runtime do sandbox.',
  },
  ripgrep: {
    title: 'Ripgrep',
    description: 'Tweaks específicos para chamadas do ripgrep dentro do sandbox.',
  },
  seccomp: {
    title: 'Seccomp',
    description: 'Configuração específica de seccomp (apenas Linux).',
    linuxOnly: true,
  },
}

function emptySandbox(): SandboxSettings {
  return {
    enabled: false,
    failIfUnavailable: false,
    autoAllowBashIfSandboxed: false,
    ignoreViolations: false,
    enableWeakerNestedSandbox: false,
    enableWeakerNetworkIsolation: false,
    allowUnsandboxedCommands: [],
    excludedCommands: [],
    enabledPlatforms: [],
    network: null,
    filesystem: null,
    ripgrep: null,
    seccomp: null,
  }
}

function toJsonText(value: Record<string, unknown> | null): string {
  if (value == null) return ''
  return JSON.stringify(value, null, 2)
}

function parseJsonField(text: string): { value: Record<string, unknown> | null; error: string | null } {
  const trimmed = text.trim()
  if (!trimmed) return { value: null, error: null }
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed === null) return { value: null, error: null }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { value: null, error: 'Deve ser um objeto JSON.' }
    }
    return { value: parsed as Record<string, unknown>, error: null }
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message : 'JSON inválido.' }
  }
}

export function SettingsPage() {
  const navigate = useNavigate()
  const goBack = useCallback(() => navigate('/'), [navigate])
  const { config, defaults, bounds, loading, error, update } = useConfig()
  const sessions = useSessionList()
  const projects = useMemo(
    () => [...sessions.projects].sort((a, b) => a.cwd.localeCompare(b.cwd)),
    [sessions.projects],
  )

  const [tab, setTab] = useState<TabId>('sessions')
  const [sandboxScope, setSandboxScope] = useState<SandboxScope>('user-local')
  const [sandboxProjectCwd, setSandboxProjectCwd] = useState<string | null>(null)
  const cs = useClaudeSettings(
    sandboxScope,
    scopeNeedsProject(sandboxScope) ? sandboxProjectCwd : null,
  )

  const [standbyUnit, setStandbyUnit] = useState<StandbyUnit>('minutes')
  const [standbyValue, setStandbyValue] = useState<string>('')
  const [sandbox, setSandbox] = useState<SandboxSettings>(emptySandbox)
  const [jsonState, setJsonState] = useState<Record<JsonFieldKey, JsonFieldState>>(() => ({
    network: { text: '', error: null },
    filesystem: { text: '', error: null },
    ripgrep: { text: '', error: null },
    seccomp: { text: '', error: null },
  }))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!scopeNeedsProject(sandboxScope)) return
    if (!sandboxProjectCwd && projects.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pick first project when entering project scope
      setSandboxProjectCwd(projects[0].cwd)
    }
  }, [sandboxScope, sandboxProjectCwd, projects])

  /* eslint-disable react-hooks/set-state-in-effect -- hydrate form state from server data when it arrives or scope changes */
  useEffect(() => {
    if (!config) return
    const ms = config.standbyTimeoutMs
    if (ms % 60000 === 0) {
      setStandbyUnit('minutes')
      setStandbyValue(String(ms / 60000))
    } else {
      setStandbyUnit('seconds')
      setStandbyValue(String(Math.round(ms / 1000)))
    }
  }, [config])

  useEffect(() => {
    if (cs.settings) {
      setSandbox(cs.settings.sandbox)
      setJsonState({
        network: { text: toJsonText(cs.settings.sandbox.network), error: null },
        filesystem: { text: toJsonText(cs.settings.sandbox.filesystem), error: null },
        ripgrep: { text: toJsonText(cs.settings.sandbox.ripgrep), error: null },
        seccomp: { text: toJsonText(cs.settings.sandbox.seccomp), error: null },
      })
    } else {
      setSandbox(emptySandbox())
      setJsonState({
        network: { text: '', error: null },
        filesystem: { text: '', error: null },
        ripgrep: { text: '', error: null },
        seccomp: { text: '', error: null },
      })
    }
  }, [cs.settings])
  /* eslint-enable react-hooks/set-state-in-effect */

  const standbyFactor = standbyUnit === 'minutes' ? 60000 : 1000
  const standbyUnitLabel = standbyUnit === 'minutes' ? 'minutos' : 'segundos'
  const minStandbyMs = bounds?.standbyTimeoutMs.min ?? 60000
  const maxStandbyMs = bounds?.standbyTimeoutMs.max ?? 24 * 60 * 60 * 1000
  const defaultStandbyMs = defaults?.standbyTimeoutMs ?? 10 * 60 * 1000
  const minStandby = Math.max(1, Math.ceil(minStandbyMs / standbyFactor))
  const maxStandby = Math.floor(maxStandbyMs / standbyFactor)
  const defaultStandby = Math.round(defaultStandbyMs / standbyFactor)

  const changeStandbyUnit = (next: StandbyUnit) => {
    if (next === standbyUnit) return
    const current = Number(standbyValue)
    if (Number.isFinite(current)) {
      const ms = current * standbyFactor
      const nextFactor = next === 'minutes' ? 60000 : 1000
      const converted = ms / nextFactor
      setStandbyValue(
        Number.isInteger(converted) ? String(converted) : String(Number(converted.toFixed(3))),
      )
    }
    setStandbyUnit(next)
  }

  const linuxEnabled = sandbox.enabledPlatforms.includes('linux')

  const jsonHasErrors = useMemo(
    () => JSON_FIELDS.some((k) => jsonState[k].error != null),
    [jsonState],
  )

  const canSaveSandbox =
    !scopeNeedsProject(sandboxScope) || sandboxProjectCwd != null

  const save = async () => {
    const n = Number(standbyValue)
    const ms = Math.round(n * standbyFactor)
    if (!Number.isFinite(n) || ms < minStandbyMs || ms > maxStandbyMs) {
      setSaveError(`Standby deve estar entre ${minStandby} e ${maxStandby} ${standbyUnitLabel}.`)
      setTab('sessions')
      return
    }

    const parsed: Partial<Record<JsonFieldKey, Record<string, unknown> | null>> = {}
    const nextJsonState = { ...jsonState }
    let firstError: string | null = null
    for (const key of JSON_FIELDS) {
      const result = parseJsonField(jsonState[key].text)
      nextJsonState[key] = { text: jsonState[key].text, error: result.error }
      if (result.error) {
        firstError = firstError ?? `${JSON_FIELD_META[key].title}: ${result.error}`
      } else {
        parsed[key] = result.value
      }
    }
    if (firstError) {
      setJsonState(nextJsonState)
      setSaveError(firstError)
      setTab('sandbox')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await update({ standbyTimeoutMs: ms })
      if (canSaveSandbox) {
        const payload: SandboxSettings = {
          ...sandbox,
          network: parsed.network ?? null,
          filesystem: parsed.filesystem ?? null,
          ripgrep: parsed.ripgrep ?? null,
          seccomp: parsed.seccomp ?? null,
        }
        await cs.update({ sandbox: payload })
      }
      goBack()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const isLoading = loading
  const loadError = error
  const sandboxLoading = cs.loading && canSaveSandbox
  const sandboxError = cs.error

  const setSandboxField = <K extends keyof SandboxSettings>(key: K, value: SandboxSettings[K]) => {
    setSandbox((s) => ({ ...s, [key]: value }))
  }

  const togglePlatform = (id: SandboxPlatform, checked: boolean) => {
    setSandbox((s) => {
      const set = new Set(s.enabledPlatforms)
      if (checked) set.add(id)
      else set.delete(id)
      return { ...s, enabledPlatforms: PLATFORM_OPTIONS.map((p) => p.id).filter((p) => set.has(p)) }
    })
  }

  const setJsonText = (key: JsonFieldKey, text: string) => {
    const result = parseJsonField(text)
    setJsonState((prev) => ({ ...prev, [key]: { text, error: result.error } }))
  }

  const sandboxDisabled = !sandbox.enabled

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Voltar">
          <ArrowLeft size={16} />
        </Button>
        <h1 className="text-sm font-semibold text-foreground">Configurações</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs
          tabs={[
            { id: 'sessions', label: 'Sessões' },
            { id: 'sandbox', label: 'Sandbox' },
            { id: 'memory', label: 'Memória' },
            { id: 'agents', label: 'Agentes' },
            { id: 'skills', label: 'Skills' },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto divide-y divide-border">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Carregando…</p>
          ) : loadError ? (
            <p className="p-4 text-xs text-red-400">Erro: {loadError}</p>
          ) : tab === 'sessions' ? (
            <Section title="Sessões">
              <Field
                label={`Timeout de standby (${standbyUnitLabel})`}
                hint={`Sessões em standby são finalizadas após este tempo. Entre ${minStandby} e ${maxStandby} ${standbyUnitLabel}. Padrão: ${defaultStandby}.`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={minStandby}
                    max={maxStandby}
                    value={standbyValue}
                    onChange={(e) => setStandbyValue(e.target.value)}
                    className="w-32 rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
                  />
                  <div className="flex rounded border border-border overflow-hidden">
                    {STANDBY_UNIT_OPTIONS.map((opt) => {
                      const isActive = opt.id === standbyUnit
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => changeStandbyUnit(opt.id)}
                          className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
                            isActive
                              ? 'bg-sky-700 text-white'
                              : 'bg-background text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </Field>
            </Section>
          ) : tab === 'memory' ? (
            <MemoryTab />
          ) : tab === 'agents' ? (
            <AgentsTab />
          ) : tab === 'skills' ? (
            <SkillsTab />
          ) : (
            <>
              <SandboxScopeSection
                scope={sandboxScope}
                onScopeChange={(s) => {
                  setSandboxScope(s)
                  setSaveError(null)
                }}
                projectCwd={sandboxProjectCwd}
                onProjectChange={setSandboxProjectCwd}
                projects={projects}
                projectsLoading={sessions.loading}
                projectsError={sessions.error}
              />

              {scopeNeedsProject(sandboxScope) && !sandboxProjectCwd ? (
                <Section title="Geral">
                  <p className="text-xs text-muted-foreground">
                    {sessions.loading
                      ? 'Carregando projetos…'
                      : projects.length === 0
                        ? 'Nenhum projeto encontrado em ~/.claude/projects. Abra um claude neste diretório primeiro.'
                        : 'Selecione um projeto acima para editar as configurações.'}
                  </p>
                </Section>
              ) : sandboxLoading ? (
                <Section title="Geral">
                  <p className="text-xs text-muted-foreground">Carregando configurações…</p>
                </Section>
              ) : sandboxError ? (
                <Section title="Geral">
                  <p className="text-xs text-red-400">Erro: {sandboxError}</p>
                </Section>
              ) : (
                <>
              <Section
                title="Geral"
                description="Vale para novos processos do claude — sessões já abertas mantêm o estado anterior."
              >
                <ToggleField
                  label="Habilitar sandbox"
                  checked={sandbox.enabled}
                  onChange={(v) => setSandboxField('enabled', v)}
                />
              </Section>

              <Section title="Comportamento">
                <ToggleField
                  label="Falhar se runtime de sandbox indisponível"
                  hint="Sem isso, o claude roda fora do sandbox quando o runtime não está disponível."
                  checked={sandbox.failIfUnavailable}
                  onChange={(v) => setSandboxField('failIfUnavailable', v)}
                  disabled={sandboxDisabled}
                />
                <ToggleField
                  label="Auto-permitir Bash quando em sandbox"
                  checked={sandbox.autoAllowBashIfSandboxed}
                  onChange={(v) => setSandboxField('autoAllowBashIfSandboxed', v)}
                  disabled={sandboxDisabled}
                />
                <ToggleField
                  label="Apenas logar violações (não bloqueia)"
                  checked={sandbox.ignoreViolations}
                  onChange={(v) => setSandboxField('ignoreViolations', v)}
                  disabled={sandboxDisabled}
                />
                <ToggleField
                  label="Permitir sandbox aninhado mais fraco"
                  checked={sandbox.enableWeakerNestedSandbox}
                  onChange={(v) => setSandboxField('enableWeakerNestedSandbox', v)}
                  disabled={sandboxDisabled}
                />
                <ToggleField
                  label="Relaxar isolamento de rede"
                  checked={sandbox.enableWeakerNetworkIsolation}
                  onChange={(v) => setSandboxField('enableWeakerNetworkIsolation', v)}
                  disabled={sandboxDisabled}
                />
              </Section>

              <Section
                title="Plataformas"
                description="Plataformas onde o sandbox é ativado. Se vazio, o runtime decide."
              >
                <div className="flex gap-4">
                  {PLATFORM_OPTIONS.map((p) => (
                    <CheckboxField
                      key={p.id}
                      label={p.label}
                      checked={sandbox.enabledPlatforms.includes(p.id)}
                      onChange={(v) => togglePlatform(p.id, v)}
                      disabled={sandboxDisabled}
                    />
                  ))}
                </div>
              </Section>

              <Section
                title="Comandos permitidos fora do sandbox"
                description="Comandos listados rodam fora do sandbox (sujeitos às permissões normais)."
              >
                <StringListEditor
                  values={sandbox.allowUnsandboxedCommands}
                  onChange={(v) => setSandboxField('allowUnsandboxedCommands', v)}
                  placeholder="ex.: npm install"
                  disabled={sandboxDisabled}
                />
              </Section>

              <Section
                title="Comandos que bypassam o sandbox"
                description="Comandos que não devem ser executados via sandbox (excluídos por completo)."
              >
                <StringListEditor
                  values={sandbox.excludedCommands}
                  onChange={(v) => setSandboxField('excludedCommands', v)}
                  placeholder="ex.: docker"
                  disabled={sandboxDisabled}
                />
              </Section>

              {JSON_FIELDS.filter((k) => !JSON_FIELD_META[k].linuxOnly || linuxEnabled).map((k) => (
                <Section key={k} title={JSON_FIELD_META[k].title} description={JSON_FIELD_META[k].description}>
                  <JsonEditor
                    text={jsonState[k].text}
                    error={jsonState[k].error}
                    onChange={(text) => setJsonText(k, text)}
                    disabled={sandboxDisabled}
                  />
                </Section>
              ))}
                </>
              )}
            </>
          )}
          {saveError ? <p className="p-4 text-xs text-red-400">{saveError}</p> : null}
        </div>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border bg-black/30 px-4 py-3">
        <Button variant="ghost" onClick={goBack}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || isLoading || !!loadError || jsonHasErrors || sandboxLoading}
        >
          Salvar
        </Button>
      </footer>
    </div>
  )
}

function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex border-b border-border bg-black/20">
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
  )
}

function SandboxScopeSection({
  scope,
  onScopeChange,
  projectCwd,
  onProjectChange,
  projects,
  projectsLoading,
  projectsError,
}: {
  scope: SandboxScope
  onScopeChange: (s: SandboxScope) => void
  projectCwd: string | null
  onProjectChange: (cwd: string) => void
  projects: Project[]
  projectsLoading: boolean
  projectsError: string | null
}) {
  const active = SCOPE_OPTIONS.find((o) => o.id === scope)
  const needsProject = scopeNeedsProject(scope)
  return (
    <Section
      title="Escopo"
      description="Onde as configurações serão salvas. A CLI aplica Managed > Local > Project > User, mesclando arrays entre escopos."
    >
      <div className="flex rounded border border-border overflow-hidden w-fit">
        {SCOPE_OPTIONS.map((opt) => {
          const isActive = opt.id === scope
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onScopeChange(opt.id)}
              className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive ? 'bg-sky-700 text-white' : 'bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {active ? (
        <p className="text-[10px] text-muted-foreground">{active.hint}</p>
      ) : null}

      {needsProject ? (
        <Field label="Projeto">
          {projectsLoading ? (
            <span className="text-xs text-muted-foreground">Carregando projetos…</span>
          ) : projectsError ? (
            <span className="text-xs text-red-400">Erro: {projectsError}</span>
          ) : projects.length === 0 ? (
            <span className="text-xs text-muted-foreground">Nenhum projeto encontrado.</span>
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
    </Section>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 p-4">
      <header className="flex flex-col gap-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="text-[11px] text-muted-foreground">{description}</p>
        ) : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

function ToggleField({
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

function CheckboxField({
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

function StringListEditor({
  values,
  onChange,
  placeholder,
  disabled,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const updateAt = (idx: number, next: string) => {
    const copy = values.slice()
    copy[idx] = next
    onChange(copy)
  }
  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx))
  }
  const add = () => onChange([...values, ''])

  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-50' : ''}`}>
      {values.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nenhum item.</p>
      ) : (
        values.map((v, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => updateAt(idx, e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeAt(idx)}
              disabled={disabled}
              aria-label="Remover"
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))
      )}
      <div>
        <Button type="button" variant="ghost" size="xs" onClick={add} disabled={disabled}>
          <Plus size={12} /> Adicionar
        </Button>
      </div>
    </div>
  )
}

function JsonEditor({
  text,
  error,
  onChange,
  disabled,
}: {
  text: string
  error: string | null
  onChange: (text: string) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        rows={6}
        placeholder="{}"
        className={`w-full rounded border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none disabled:cursor-not-allowed ${
          error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-sky-500'
        }`}
      />
      {error ? (
        <span className="text-[10px] text-red-400">JSON inválido: {error}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground">
          Vazio = remove a chave do settings.local.json.
        </span>
      )}
    </div>
  )
}

function MemoryTab() {
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
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync selection with available projects
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
          <p className="text-xs text-muted-foreground">Nenhum projeto encontrado em ~/.claude/projects.</p>
        ) : (
          <>
            <ProjectPicker
              projects={projects}
              value={selectedCwd}
              onChange={setSelectedCwd}
            />
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

function HierarchyRow({ entry, cwd }: { entry: MemoryHierarchyEntry; cwd: string }) {
  const isProject = entry.scope === 'project'
  const scopeLabel =
    entry.scope === 'global' ? 'global' : isProject ? 'projeto' : 'ancestral'
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
      <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
        {entry.size}B
      </span>
    </li>
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

function ProjectMemoryEditor({
  project,
  variant,
}: {
  project: Project
  variant: MemoryVariant
}) {
  const memory = useProjectMemory(project.cwd, variant)
  const placeholder =
    variant === 'local'
      ? `# CLAUDE.local.md de ${project.cwd}\nPreferências pessoais (não commitadas)…`
      : `# CLAUDE.md de ${project.cwd}\nRegras que valem só para este projeto…`
  const hintParts: string[] = []
  if (!project.cwdResolved) {
    hintParts.push('O cwd foi inferido do slug do projeto e pode não corresponder ao diretório real.')
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

function MemoryEditor({
  data,
  loading,
  loadError,
  onSave,
  onReload,
  placeholder,
  hint,
}: {
  data: MemoryFile | null
  loading: boolean
  loadError: string | null
  onSave: (content: string) => Promise<MemoryFile>
  onReload: () => Promise<void> | void
  placeholder?: string
  hint?: string
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showExpanded, setShowExpanded] = useState(false)
  const [expand, setExpand] = useState<ExpandResult | null>(null)
  const [expanding, setExpanding] = useState(false)
  const [expandError, setExpandError] = useState<string | null>(null)
  const expandReq = useRef(0)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate textarea when data loads
    setText(data?.content ?? '')
    setError(null)
    setSavedAt(null)
    setShowExpanded(false)
    setExpand(null)
    setExpandError(null)
  }, [data])

  const dirty = (data?.content ?? '') !== text
  const hasImports = /^\s*@\S+\s*$/m.test(text)
  const basePath = data?.path ?? null

  useEffect(() => {
    if (!showExpanded || !basePath) return
    const id = ++expandReq.current
    // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced fetch of server-side expansion
    setExpanding(true)
    setExpandError(null)
    const handle = setTimeout(() => {
      expandMemoryImports(text, basePath)
        .then((res) => {
          if (expandReq.current !== id) return
          setExpand(res)
          setExpanding(false)
        })
        .catch((err) => {
          if (expandReq.current !== id) return
          setExpandError(err instanceof Error ? err.message : String(err))
          setExpanding(false)
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [showExpanded, text, basePath])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(text)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleRevert = () => {
    setText(data?.content ?? '')
    setError(null)
  }

  if (loading && !data) {
    return <p className="text-xs text-muted-foreground">Carregando…</p>
  }
  if (loadError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-red-400">Erro: {loadError}</p>
        <div>
          <Button type="button" variant="ghost" size="xs" onClick={onReload}>
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {data?.path ? (
        <p className="font-mono text-[10px] text-muted-foreground">{data.path}</p>
      ) : null}
      {hint ? <p className="text-[10px] text-amber-400">{hint}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowExpanded((v) => !v)}
          disabled={!basePath}
          className="cursor-pointer rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showExpanded ? 'Editar' : 'Preview com imports expandidos'}
        </button>
        {hasImports ? (
          <span className="text-[10px] text-sky-400">contém imports @</span>
        ) : null}
      </div>
      {showExpanded ? (
        <ExpandedPreview
          result={expand}
          loading={expanding}
          error={expandError}
        />
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={12}
          placeholder={placeholder}
          className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-foreground">
          {error ? (
            <span className="text-red-400">Erro: {error}</span>
          ) : dirty ? (
            'Mudanças não salvas.'
          ) : savedAt ? (
            'Salvo.'
          ) : data?.exists ? (
            ''
          ) : (
            'Arquivo ainda não existe — será criado ao salvar.'
          )}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleRevert}
            disabled={!dirty || saving}
          >
            Reverter
          </Button>
          <Button
            type="button"
            variant="primary"
            size="xs"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? 'Salvando…' : 'Salvar memória'}
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Salvar com texto vazio remove o arquivo.
      </p>
    </div>
  )
}

function ExpandedPreview({
  result,
  loading,
  error,
}: {
  result: ExpandResult | null
  loading: boolean
  error: string | null
}) {
  if (error) {
    return <p className="text-[10px] text-red-400">Erro ao expandir: {error}</p>
  }
  if (!result && loading) {
    return <p className="text-[10px] text-muted-foreground">Expandindo imports…</p>
  }
  if (!result) {
    return <p className="text-[10px] text-muted-foreground">Preparando preview…</p>
  }
  const issues = result.imports.filter((i) => i.error)
  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-80 w-full overflow-auto rounded border border-border bg-black/30 px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground whitespace-pre-wrap">
        {result.expanded || <span className="text-muted-foreground">(vazio)</span>}
      </pre>
      {result.truncated ? (
        <p className="text-[10px] text-amber-400">
          Limite de profundidade atingido — alguns imports não foram expandidos.
        </p>
      ) : null}
      {result.imports.length > 0 ? (
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            {result.imports.length} import{result.imports.length === 1 ? '' : 's'} resolvido
            {result.imports.length === 1 ? '' : 's'}
            {issues.length > 0 ? ` (${issues.length} com problema)` : ''}
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono">
            {result.imports.map((imp, i) => (
              <li key={`${imp.resolved}:${i}`} className="flex items-baseline gap-2">
                <span
                  className={`w-16 shrink-0 rounded px-1 text-[9px] uppercase ${
                    imp.error
                      ? 'bg-red-500/20 text-red-300'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {imp.error || 'ok'}
                </span>
                <span className="truncate" title={imp.resolved ?? imp.raw}>
                  @{imp.raw}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
