import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import type { Project, SandboxPlatform, SandboxScope, SandboxSettings } from '@/types'
import { CheckboxField, Field, Section, ToggleField } from './atoms'
import { JsonEditor } from './JsonEditor'
import { StringListEditor } from './StringListEditor'

const PLATFORM_OPTIONS: { id: SandboxPlatform; labelKey: string }[] = [
  { id: 'macos', labelKey: 'settings.sandbox.platforms.macos' },
  { id: 'linux', labelKey: 'settings.sandbox.platforms.linux' },
]

export const JSON_FIELDS = ['network', 'filesystem', 'ripgrep', 'seccomp'] as const
export type JsonFieldKey = (typeof JSON_FIELDS)[number]

export type JsonFieldState = {
  text: string
  error: string | null
}

export const JSON_FIELD_META: Record<
  JsonFieldKey,
  { titleKey: string; descriptionKey: string; linuxOnly?: boolean }
> = {
  network: {
    titleKey: 'settings.sandbox.sections.network.title',
    descriptionKey: 'settings.sandbox.sections.network.help',
  },
  filesystem: {
    titleKey: 'settings.sandbox.sections.filesystem.title',
    descriptionKey: 'settings.sandbox.sections.filesystem.help',
  },
  ripgrep: {
    titleKey: 'settings.sandbox.sections.ripgrep.title',
    descriptionKey: 'settings.sandbox.sections.ripgrep.help',
  },
  seccomp: {
    titleKey: 'settings.sandbox.sections.seccomp.title',
    descriptionKey: 'settings.sandbox.sections.seccomp.help',
    linuxOnly: true,
  },
}

const SCOPE_OPTIONS: { id: SandboxScope; labelKey: string; hintKey: string }[] = [
  {
    id: 'user',
    labelKey: 'settings.sandbox.scopes.user',
    hintKey: 'settings.sandbox.scopeHints.user',
  },
  {
    id: 'user-local',
    labelKey: 'settings.sandbox.scopes.userLocal',
    hintKey: 'settings.sandbox.scopeHints.userLocal',
  },
  {
    id: 'project',
    labelKey: 'settings.sandbox.scopes.project',
    hintKey: 'settings.sandbox.scopeHints.project',
  },
  {
    id: 'project-local',
    labelKey: 'settings.sandbox.scopes.projectLocal',
    hintKey: 'settings.sandbox.scopeHints.projectLocal',
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
      return { value: null, error: i18n.t('settings.sandbox.mustBeObject') }
    }
    return { value: parsed as Record<string, unknown>, error: null }
  } catch (err) {
    return {
      value: null,
      error: err instanceof Error ? err.message : i18n.t('settings.sandbox.invalidJson'),
    }
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
  const { t } = useTranslation()
  const active = SCOPE_OPTIONS.find((o) => o.id === scope)
  const needsProject = scopeNeedsProject(scope)
  return (
    <Section title={t('settings.sandbox.scope')} description={t('settings.sandbox.scopeHelp')}>
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
              {t(opt.labelKey)}
            </button>
          )
        })}
      </div>

      {active ? <p className="text-[10px] text-muted-foreground">{t(active.hintKey)}</p> : null}

      {needsProject ? (
        <Field label={t('settings.sandbox.project')}>
          {projectsLoading ? (
            <span className="text-xs text-muted-foreground">
              {t('settings.sandbox.loadingProjects')}
            </span>
          ) : projectsError ? (
            <span className="text-xs text-red-400">
              {t('common.errorPrefix', { message: projectsError })}
            </span>
          ) : projects.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              {t('settings.sandbox.noProjects')}
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
  const { t } = useTranslation()
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
        <Section title={t('settings.sandbox.general')}>
          <p className="text-xs text-muted-foreground">
            {projectsLoading
              ? t('settings.sandbox.loadingProjects')
              : projects.length === 0
                ? t('settings.sandbox.noProjectsExplain')
                : t('settings.sandbox.selectProject')}
          </p>
        </Section>
      ) : sandboxLoading ? (
        <Section title={t('settings.sandbox.general')}>
          <p className="text-xs text-muted-foreground">{t('settings.sandbox.loadingSettings')}</p>
        </Section>
      ) : sandboxError ? (
        <Section title={t('settings.sandbox.general')}>
          <p className="text-xs text-red-400">
            {t('common.errorPrefix', { message: sandboxError })}
          </p>
        </Section>
      ) : (
        <>
          <Section
            title={t('settings.sandbox.general')}
            description={t('settings.sandbox.applyToNew')}
          >
            <ToggleField
              label={t('settings.sandbox.enable')}
              checked={sandbox.enabled}
              onChange={(v) => setSandboxField('enabled', v)}
            />
          </Section>

          <Section title={t('settings.sandbox.behavior')}>
            <ToggleField
              label={t('settings.sandbox.failClosed')}
              hint={t('settings.sandbox.failClosedHint')}
              checked={sandbox.failIfUnavailable}
              onChange={(v) => setSandboxField('failIfUnavailable', v)}
              disabled={sandboxDisabled}
            />
            <ToggleField
              label={t('settings.sandbox.autoAllowBash')}
              checked={sandbox.autoAllowBashIfSandboxed}
              onChange={(v) => setSandboxField('autoAllowBashIfSandboxed', v)}
              disabled={sandboxDisabled}
            />
            <ToggleField
              label={t('settings.sandbox.logOnly')}
              checked={sandbox.ignoreViolations}
              onChange={(v) => setSandboxField('ignoreViolations', v)}
              disabled={sandboxDisabled}
            />
            <ToggleField
              label={t('settings.sandbox.allowNested')}
              checked={sandbox.enableWeakerNestedSandbox}
              onChange={(v) => setSandboxField('enableWeakerNestedSandbox', v)}
              disabled={sandboxDisabled}
            />
            <ToggleField
              label={t('settings.sandbox.relaxNetwork')}
              checked={sandbox.enableWeakerNetworkIsolation}
              onChange={(v) => setSandboxField('enableWeakerNetworkIsolation', v)}
              disabled={sandboxDisabled}
            />
          </Section>

          <Section
            title={t('settings.sandbox.platforms_label')}
            description={t('settings.sandbox.platformsHelp')}
          >
            <div className="flex gap-4">
              {PLATFORM_OPTIONS.map((p) => (
                <CheckboxField
                  key={p.id}
                  label={t(p.labelKey)}
                  checked={sandbox.enabledPlatforms.includes(p.id)}
                  onChange={(v) => togglePlatform(p.id, v)}
                  disabled={sandboxDisabled}
                />
              ))}
            </div>
          </Section>

          <Section
            title={t('settings.sandbox.allowOutside')}
            description={t('settings.sandbox.allowOutsideHelp')}
          >
            <StringListEditor
              values={sandbox.allowUnsandboxedCommands}
              onChange={(v) => setSandboxField('allowUnsandboxedCommands', v)}
              placeholder={t('settings.sandbox.allowOutsidePlaceholder')}
              disabled={sandboxDisabled}
            />
          </Section>

          <Section
            title={t('settings.sandbox.bypass')}
            description={t('settings.sandbox.bypassHelp')}
          >
            <StringListEditor
              values={sandbox.excludedCommands}
              onChange={(v) => setSandboxField('excludedCommands', v)}
              placeholder={t('settings.sandbox.bypassPlaceholder')}
              disabled={sandboxDisabled}
            />
          </Section>

          {JSON_FIELDS.filter((k) => !JSON_FIELD_META[k].linuxOnly || linuxEnabled).map((k) => (
            <Section
              key={k}
              title={t(JSON_FIELD_META[k].titleKey)}
              description={t(JSON_FIELD_META[k].descriptionKey)}
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
