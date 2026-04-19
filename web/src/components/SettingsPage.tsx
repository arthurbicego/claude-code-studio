import { ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { AgentsTab } from '@/components/settings/AgentsTab'
import { GeralTab } from '@/components/settings/GeralTab'
import { MemoryTab } from '@/components/settings/MemoryTab'
import {
  emptySandbox,
  JSON_FIELD_META,
  JSON_FIELDS,
  type JsonFieldKey,
  type JsonFieldState,
  PLATFORM_OPTIONS,
  parseJsonField,
  SandboxTab,
  scopeNeedsProject,
  toJsonText,
} from '@/components/settings/SandboxTab'
import { SessionsTab, type StandbyUnit } from '@/components/settings/SessionsTab'
import { SidebarPrefsTab } from '@/components/settings/SidebarPrefsTab'
import { SkillsTab } from '@/components/settings/SkillsTab'
import { Tabs } from '@/components/settings/Tabs'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { useClaudeSettings } from '@/hooks/useClaudeSettings'
import { useConfig } from '@/hooks/useConfig'
import { useSessionList } from '@/hooks/useSessionList'
import type { SandboxPlatform, SandboxScope, SandboxSettings } from '@/types'

type TabId = 'geral' | 'sessions' | 'sandbox' | 'memory' | 'agents' | 'skills' | 'sidebar'

export function SettingsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const goBack = useCallback(() => navigate('/'), [navigate])
  const { config, defaults, bounds, loading, error, update } = useConfig()
  const sessions = useSessionList()
  const projects = useMemo(
    () => [...sessions.projects].sort((a, b) => a.cwd.localeCompare(b.cwd)),
    [sessions.projects],
  )

  const [tab, setTab] = useState<TabId>('geral')
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
      // biome-ignore lint/correctness/useExhaustiveDependencies: pick first project when entering project scope
      setSandboxProjectCwd(projects[0].cwd)
    }
  }, [sandboxScope, sandboxProjectCwd, projects])

  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate form state from config on load
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate form state from sandbox settings on load
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

  const standbyFactor = standbyUnit === 'minutes' ? 60000 : 1000
  const standbyUnitLabel =
    standbyUnit === 'minutes' ? t('settings.sessions.unit.minutes') : t('settings.sessions.unit.seconds')
  const minStandbyMs = bounds?.standbyTimeoutMs.min ?? 60000
  const maxStandbyMs = bounds?.standbyTimeoutMs.max ?? 24 * 60 * 60 * 1000
  const minStandby = Math.max(1, Math.ceil(minStandbyMs / standbyFactor))
  const maxStandby = Math.floor(maxStandbyMs / standbyFactor)

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

  const jsonHasErrors = useMemo(
    () => JSON_FIELDS.some((k) => jsonState[k].error != null),
    [jsonState],
  )

  const canSaveSandbox = !scopeNeedsProject(sandboxScope) || sandboxProjectCwd != null

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

  const save = async () => {
    const n = Number(standbyValue)
    const ms = Math.round(n * standbyFactor)
    if (!Number.isFinite(n) || ms < minStandbyMs || ms > maxStandbyMs) {
      setSaveError(
        t('settings.sessions.standbyError', {
          min: minStandby,
          max: maxStandby,
          unit: standbyUnitLabel,
        }),
      )
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
        firstError = firstError ?? `${t(JSON_FIELD_META[key].titleKey)}: ${result.error}`
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

  const sandboxLoading = cs.loading && canSaveSandbox

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Tooltip content={t('common.back')}>
          <Button variant="ghost" size="icon" onClick={goBack} aria-label={t('common.back')}>
            <ArrowLeft size={16} />
          </Button>
        </Tooltip>
        <h1 className="text-sm font-semibold text-foreground">{t('settings.title')}</h1>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Tabs
          tabs={[
            { id: 'geral', label: t('settings.tabs.geral') },
            { id: 'sessions', label: t('settings.tabs.sessions') },
            { id: 'sandbox', label: t('settings.tabs.sandbox') },
            { id: 'memory', label: t('settings.tabs.memory') },
            { id: 'agents', label: t('settings.tabs.agents') },
            { id: 'skills', label: t('settings.tabs.skills') },
            { id: 'sidebar', label: t('settings.tabs.sidebar') },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto divide-y divide-border">
          {loading ? (
            <p className="p-4 text-xs text-muted-foreground">{t('common.loading')}</p>
          ) : error ? (
            <p className="p-4 text-xs text-red-400">{t('common.errorPrefix', { message: error })}</p>
          ) : tab === 'geral' ? (
            <GeralTab />
          ) : tab === 'sessions' ? (
            <SessionsTab
              unit={standbyUnit}
              value={standbyValue}
              bounds={bounds}
              defaults={defaults}
              onUnitChange={changeStandbyUnit}
              onValueChange={setStandbyValue}
            />
          ) : tab === 'memory' ? (
            <MemoryTab />
          ) : tab === 'agents' ? (
            <AgentsTab />
          ) : tab === 'skills' ? (
            <SkillsTab />
          ) : tab === 'sidebar' ? (
            <SidebarPrefsTab />
          ) : (
            <SandboxTab
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
              sandboxLoading={sandboxLoading}
              sandboxError={cs.error}
              sandbox={sandbox}
              setSandboxField={setSandboxField}
              togglePlatform={togglePlatform}
              jsonState={jsonState}
              setJsonText={setJsonText}
            />
          )}
          {saveError ? <p className="p-4 text-xs text-red-400">{saveError}</p> : null}
        </div>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border bg-black/30 px-4 py-3">
        <Button variant="ghost" onClick={goBack}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={save}
          disabled={saving || loading || !!error || jsonHasErrors || sandboxLoading}
        >
          {t('common.save')}
        </Button>
      </footer>
    </div>
  )
}
