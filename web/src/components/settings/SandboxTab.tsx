import type { Project, SandboxPlatform, SandboxScope, SandboxSettings } from '@/types'
import { CheckboxField, Field, Section, ToggleField } from './atoms'
import { JsonEditor } from './JsonEditor'
import { StringListEditor } from './StringListEditor'

const PLATFORM_OPTIONS: { id: SandboxPlatform; label: string }[] = [
  { id: 'macos', label: 'macOS' },
  { id: 'linux', label: 'Linux' },
]

export const JSON_FIELDS = ['network', 'filesystem', 'ripgrep', 'seccomp'] as const
export type JsonFieldKey = (typeof JSON_FIELDS)[number]

export type JsonFieldState = {
  text: string
  error: string | null
}

export const JSON_FIELD_META: Record<
  JsonFieldKey,
  { title: string; description: string; linuxOnly?: boolean }
> = {
  network: {
    title: 'Rede',
    description:
      'Regras de allow/deny para hosts e portas. Estrutura aceita pelo runtime do sandbox.',
  },
  filesystem: {
    title: 'Sistema de arquivos',
    description:
      'Permissões de leitura/escrita em diretórios. Estrutura aceita pelo runtime do sandbox.',
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

export function scopeNeedsProject(scope: SandboxScope): boolean {
  return scope === 'project' || scope === 'project-local'
}

export function emptySandbox(): SandboxSettings {
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

export function toJsonText(value: Record<string, unknown> | null): string {
  if (value == null) return ''
  return JSON.stringify(value, null, 2)
}

export function parseJsonField(text: string): {
  value: Record<string, unknown> | null
  error: string | null
} {
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

      {active ? <p className="text-[10px] text-muted-foreground">{active.hint}</p> : null}

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
                <option key={p.slug} value={p.cwd}>
                  {p.cwd}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}
    </Section>
  )
}

export function SandboxTab({
  scope,
  onScopeChange,
  projectCwd,
  onProjectChange,
  projects,
  projectsLoading,
  projectsError,
  sandboxLoading,
  sandboxError,
  sandbox,
  setSandboxField,
  togglePlatform,
  jsonState,
  setJsonText,
}: {
  scope: SandboxScope
  onScopeChange: (s: SandboxScope) => void
  projectCwd: string | null
  onProjectChange: (cwd: string) => void
  projects: Project[]
  projectsLoading: boolean
  projectsError: string | null
  sandboxLoading: boolean
  sandboxError: string | null
  sandbox: SandboxSettings
  setSandboxField: <K extends keyof SandboxSettings>(key: K, value: SandboxSettings[K]) => void
  togglePlatform: (id: SandboxPlatform, checked: boolean) => void
  jsonState: Record<JsonFieldKey, JsonFieldState>
  setJsonText: (key: JsonFieldKey, text: string) => void
}) {
  const sandboxDisabled = !sandbox.enabled
  const linuxEnabled = sandbox.enabledPlatforms.includes('linux')

  return (
    <>
      <SandboxScopeSection
        scope={scope}
        onScopeChange={onScopeChange}
        projectCwd={projectCwd}
        onProjectChange={onProjectChange}
        projects={projects}
        projectsLoading={projectsLoading}
        projectsError={projectsError}
      />

      {scopeNeedsProject(scope) && !projectCwd ? (
        <Section title="Geral">
          <p className="text-xs text-muted-foreground">
            {projectsLoading
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
            <Section
              key={k}
              title={JSON_FIELD_META[k].title}
              description={JSON_FIELD_META[k].description}
            >
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
  )
}

export { PLATFORM_OPTIONS }
