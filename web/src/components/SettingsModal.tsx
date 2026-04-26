import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { AgentsTab } from '@/components/settings/AgentsTab'
import { GeralTab } from '@/components/settings/GeralTab'
import { MemoryTab } from '@/components/settings/MemoryTab'
import {
  emptySandbox,
  JSON_FIELDS,
  type JsonFieldKey,
  type JsonFieldState,
  PLATFORM_OPTIONS,
  parseJsonField,
  SandboxTab,
  scopeNeedsProject,
  toJsonText,
} from '@/components/settings/SandboxTab'
import { SaveStatusIndicator } from '@/components/settings/SaveStatusIndicator'
import { SessionsTab, type StandbyUnit } from '@/components/settings/SessionsTab'
import { SidebarPrefsTab } from '@/components/settings/SidebarPrefsTab'
import { SkillsTab } from '@/components/settings/SkillsTab'
import { Tabs } from '@/components/settings/Tabs'
import { useClaudeSettings } from '@/hooks/useClaudeSettings'
import { useConfig } from '@/hooks/useConfig'
import { SaveStatusProvider, useSaveStatus } from '@/hooks/useSaveStatus'
import { useSessionList } from '@/hooks/useSessionList'
import type { SandboxPlatform, SandboxScope, SandboxSettings } from '@/types'

type TabId = 'geral' | 'sessions' | 'sandbox' | 'memory' | 'agents' | 'skills' | 'sidebar'

type Props = {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  if (!open) return null
  return (
    <SaveStatusProvider>
      <SettingsModalInner open={open} onClose={onClose} />
    </SaveStatusProvider>
  )
}

function SettingsModalInner({ open, onClose }: Props) {
  const { t } = useTranslation()
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
  const [standbyError, setStandbyError] = useState<string | null>(null)
  const lastSavedStandbyMsRef = useRef<number | null>(null)
  const lastSavedSandboxRef = useRef<string | null>(null)
  const saveStatus = useSaveStatus()
  const { setSaving, setSaved, setError: reportSaveError } = saveStatus

  useEffect(() => {
    if (!scopeNeedsProject(sandboxScope)) return
    if (!sandboxProjectCwd && projects.length > 0) {
      setSandboxProjectCwd(projects[0].cwd)
    }
  }, [sandboxScope, sandboxProjectCwd, projects])

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
    lastSavedStandbyMsRef.current = ms
    setStandbyError(null)
  }, [config])

  useEffect(() => {
    if (!cs.settings) {
      setSandbox(emptySandbox())
      setJsonState({
        network: { text: '', error: null },
        filesystem: { text: '', error: null },
        ripgrep: { text: '', error: null },
        seccomp: { text: '', error: null },
      })
      lastSavedSandboxRef.current = null
      return
    }
    // useClaudeSettings.update echoes the saved sandbox back into cs.settings on success.
    // If we always reset state from cs.settings, any keystroke typed in the JSON fields
    // during the auto-save roundtrip is silently overwritten when the response lands. Skip
    // the reset when the incoming serialized payload matches what we just saved — that path
    // is the save echoing itself, not an external change.
    const incoming = JSON.stringify(cs.settings.sandbox)
    if (incoming === lastSavedSandboxRef.current) return
    setSandbox(cs.settings.sandbox)
    setJsonState({
      network: { text: toJsonText(cs.settings.sandbox.network), error: null },
      filesystem: { text: toJsonText(cs.settings.sandbox.filesystem), error: null },
      ripgrep: { text: toJsonText(cs.settings.sandbox.ripgrep), error: null },
      seccomp: { text: toJsonText(cs.settings.sandbox.seccomp), error: null },
    })
    lastSavedSandboxRef.current = incoming
  }, [cs.settings])

  const standbyFactor = standbyUnit === 'minutes' ? 60000 : 1000
  const standbyUnitLabel =
    standbyUnit === 'minutes'
      ? t('settings.sessions.unit.minutes')
      : t('settings.sessions.unit.seconds')
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

  const sandboxLoading = cs.loading && canSaveSandbox

  // Auto-save standby (debounced) when value is valid and changed since last save.
  useEffect(() => {
    if (!config) return
    const n = Number(standbyValue)
    if (!Number.isFinite(n)) {
      setStandbyError(
        t('settings.sessions.standbyError', {
          min: minStandby,
          max: maxStandby,
          unit: standbyUnitLabel,
        }),
      )
      return
    }
    const ms = Math.round(n * standbyFactor)
    if (ms < minStandbyMs || ms > maxStandbyMs) {
      setStandbyError(
        t('settings.sessions.standbyError', {
          min: minStandby,
          max: maxStandby,
          unit: standbyUnitLabel,
        }),
      )
      return
    }
    setStandbyError(null)
    if (ms === lastSavedStandbyMsRef.current) return

    const handle = window.setTimeout(async () => {
      setSaving()
      try {
        await update({ standbyTimeoutMs: ms })
        lastSavedStandbyMsRef.current = ms
        setSaved()
      } catch (err) {
        reportSaveError(err instanceof Error ? err.message : String(err))
      }
    }, 600)
    return () => window.clearTimeout(handle)
  }, [
    standbyValue,
    standbyFactor,
    config,
    minStandbyMs,
    maxStandbyMs,
    minStandby,
    maxStandby,
    standbyUnitLabel,
    setSaving,
    setSaved,
    reportSaveError,
    update,
    t,
  ])

  // Auto-save sandbox (debounced) when JSON is valid and payload changed since last save.
  useEffect(() => {
    if (!cs.settings || !canSaveSandbox || jsonHasErrors || sandboxLoading) return

    const parsed: Partial<Record<JsonFieldKey, Record<string, unknown> | null>> = {}
    for (const key of JSON_FIELDS) {
      const result = parseJsonField(jsonState[key].text)
      if (result.error) return
      parsed[key] = result.value
    }
    const payload: SandboxSettings = {
      ...sandbox,
      network: parsed.network ?? null,
      filesystem: parsed.filesystem ?? null,
      ripgrep: parsed.ripgrep ?? null,
      seccomp: parsed.seccomp ?? null,
    }
    const serialized = JSON.stringify(payload)
    if (serialized === lastSavedSandboxRef.current) return

    const handle = window.setTimeout(async () => {
      setSaving()
      try {
        await cs.update({ sandbox: payload })
        lastSavedSandboxRef.current = serialized
        setSaved()
      } catch (err) {
        reportSaveError(err instanceof Error ? err.message : String(err))
      }
    }, 600)
    return () => window.clearTimeout(handle)
    // useClaudeSettings returns `{ ...state, reload, update }` — a fresh object reference on
    // every render, so depending on `cs` makes the debounce reschedule on every parent
    // rerender (SSE traffic, prefs saves, etc.) and the 600 ms window can essentially never
    // elapse. List the specific fields we actually read so the timer fires when sandbox
    // input changes and stays put otherwise.
  }, [
    sandbox,
    jsonState,
    jsonHasErrors,
    canSaveSandbox,
    sandboxLoading,
    cs.settings,
    cs.update,
    setSaving,
    setSaved,
    reportSaveError,
  ])

  return (
    <Modal open={open} onClose={onClose} title={t('settings.title')} size="lg">
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
          rightSlot={<SaveStatusIndicator />}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto divide-y divide-border">
          {loading ? (
            <p className="p-4 text-xs text-muted-foreground">{t('common.loading')}</p>
          ) : error ? (
            <p className="p-4 text-xs text-red-400">
              {t('common.errorPrefix', { message: error })}
            </p>
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
              onScopeChange={setSandboxScope}
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
          {standbyError && tab === 'sessions' ? (
            <p className="p-4 text-xs text-red-400">{standbyError}</p>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
