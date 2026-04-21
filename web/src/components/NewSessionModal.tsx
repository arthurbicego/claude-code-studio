import type { PickFolderResponse } from '@shared/types'
import { AlertTriangle, ChevronRight, Folder, GitBranch } from 'lucide-react'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { Tooltip } from '@/components/ui/Tooltip'
import { ApiErrorException, readApiError, useApiErrorTranslator } from '@/lib/apiError'
import { cn } from '@/lib/utils'
import type {
  Effort,
  Model,
  PermissionMode,
  Project,
  SessionDefaults,
  SessionLaunch,
} from '@/types'

type Props = {
  open: boolean
  defaults: SessionDefaults
  projects: Project[]
  liveCwds: Set<string>
  initial?: { cwd?: string; isolate?: boolean } | null
  onClose: () => void
  onLaunch: (l: SessionLaunch) => void
}

const MODELS: Model[] = ['opus', 'sonnet', 'haiku']
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const PERMISSION_MODES: PermissionMode[] = [
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
]

const WORKTREE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean)
  return parts[parts.length - 1] || p
}

type FieldSelectProps<T extends string> = {
  label: string
  value: T
  options: readonly T[]
  defaultValue: T | null | undefined
  onChange: (v: T) => void
  info?: ReactNode
}

function OptionsInfo({
  options,
  prefix,
  tooltipKey,
  ariaKey,
}: {
  options: readonly string[]
  prefix: string
  tooltipKey: string
  ariaKey: string
}) {
  const { t } = useTranslation()
  return (
    <InfoPopover ariaLabel={t(ariaKey)} tooltip={t(tooltipKey)}>
      <dl className="flex flex-col gap-1.5">
        {options.map((opt) => (
          <div key={opt} className="flex flex-col">
            <dt className="font-mono font-semibold text-foreground">{opt}</dt>
            <dd>{t(`${prefix}.${opt}`)}</dd>
          </div>
        ))}
      </dl>
    </InfoPopover>
  )
}

function FieldSelect<T extends string>({
  label,
  value,
  options,
  defaultValue,
  onChange,
  info,
}: FieldSelectProps<T>) {
  const { t } = useTranslation()
  const labelId = useId()
  return (
    <div className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span id={labelId} className="flex items-center gap-1 text-[10px] uppercase tracking-wide">
        {label}
        {info}
      </span>
      <select
        aria-labelledby={labelId}
        className="rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o === defaultValue ? t('newSession.defaultSuffix', { value: o }) : o}
          </option>
        ))}
      </select>
    </div>
  )
}

export function NewSessionModal({
  open,
  defaults,
  projects,
  liveCwds,
  initial,
  onClose,
  onLaunch,
}: Props) {
  const { t } = useTranslation()

  const [model, setModel] = useState<Model>((defaults.model as Model) ?? MODELS[0])
  const [effort, setEffort] = useState<Effort>((defaults.effort as Effort) ?? EFFORTS[2])
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    (defaults.permissionMode as PermissionMode) ?? 'default',
  )
  const [userTouchedModel, setUserTouchedModel] = useState(false)
  const [userTouchedEffort, setUserTouchedEffort] = useState(false)
  const [userTouchedPermissionMode, setUserTouchedPermissionMode] = useState(false)
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null)
  const [isolate, setIsolate] = useState(false)
  const [userTouchedIsolate, setUserTouchedIsolate] = useState(false)
  const [worktreeName, setWorktreeName] = useState('')
  const [existingProjectsOpen, setExistingProjectsOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)

  const translateApiError = useApiErrorTranslator()

  // Server defaults load asynchronously — mirror them into local state once they arrive so the
  // select's selected value matches the "(padrão)" marker instead of staying on the fallback.
  // Skip fields the user already changed so we don't clobber their selection.
  useEffect(() => {
    if (defaults.model && !userTouchedModel) setModel(defaults.model as Model)
    if (defaults.effort && !userTouchedEffort) setEffort(defaults.effort as Effort)
    if (defaults.permissionMode && !userTouchedPermissionMode) {
      setPermissionMode(defaults.permissionMode as PermissionMode)
    }
  }, [defaults, userTouchedModel, userTouchedEffort, userTouchedPermissionMode])

  useEffect(() => {
    if (!open) {
      setSelectedCwd(null)
      setIsolate(false)
      setUserTouchedIsolate(false)
      setUserTouchedModel(false)
      setUserTouchedEffort(false)
      setUserTouchedPermissionMode(false)
      setWorktreeName('')
      setExistingProjectsOpen(false)
      setPickError(null)
      return
    }
    if (initial?.cwd) setSelectedCwd(initial.cwd)
    if (initial?.isolate) {
      setIsolate(true)
      setUserTouchedIsolate(true)
    }
  }, [open, initial])

  const effectiveCwd = selectedCwd
  const conflictsWithLive = !!effectiveCwd && liveCwds.has(effectiveCwd)

  const pickFolder = async () => {
    if (picking) return
    setPicking(true)
    setPickError(null)
    try {
      const res = await fetch('/api/pick-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPath: selectedCwd ?? undefined }),
      })
      if (!res.ok) throw new ApiErrorException(await readApiError(res))
      const data = (await res.json()) as PickFolderResponse
      if (data.path) setSelectedCwd(data.path)
    } catch (err) {
      setPickError(translateApiError(err instanceof ApiErrorException ? err.apiError : err))
    } finally {
      setPicking(false)
    }
  }

  useEffect(() => {
    if (userTouchedIsolate) return
    if (conflictsWithLive) setIsolate(true)
    else setIsolate(false)
  }, [conflictsWithLive, userTouchedIsolate])

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.cwd.localeCompare(b.cwd)),
    [projects],
  )

  const nameInvalid = isolate && worktreeName.length > 0 && !WORKTREE_NAME_RE.test(worktreeName)
  const canLaunch = !!effectiveCwd && !nameInvalid

  const launch = () => {
    if (!effectiveCwd || nameInvalid) return
    const sessionKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const launchPayload: SessionLaunch = {
      sessionKey,
      cwd: effectiveCwd,
      model,
      effort,
      permissionMode,
    }
    if (isolate) {
      launchPayload.worktree = worktreeName.trim() || '1'
    }
    onLaunch(launchPayload)
  }

  const liveCountFor = (cwd: string) => {
    let count = 0
    liveCwds.forEach((c) => {
      if (c === cwd) count++
    })
    return count
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('newSession.title')}
      className="w-[min(720px,94vw)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={!canLaunch} onClick={launch}>
            {t('newSession.start')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col overflow-y-auto">
        <section className="border-b border-border p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('newSession.folder')}
          </h3>
          <div className="flex items-center gap-2">
            <code
              dir="rtl"
              className="flex-1 truncate rounded bg-background px-2 py-1 text-left text-[11px] text-muted-foreground"
            >
              {selectedCwd ?? t('newSession.noFolderSelected')}
            </code>
            <Button size="xs" variant="ghost" onClick={pickFolder} disabled={picking}>
              <Folder size={12} className="mr-1" />
              {picking ? t('newSession.picking') : t('newSession.pickFolder')}
            </Button>
          </div>
          {pickError ? <p className="mt-2 text-[11px] text-rose-400">{pickError}</p> : null}
          <button
            type="button"
            className="mt-3 flex w-full cursor-pointer items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            onClick={() => setExistingProjectsOpen((v) => !v)}
            aria-expanded={existingProjectsOpen}
          >
            <ChevronRight
              size={10}
              className={cn('transition-transform', existingProjectsOpen && 'rotate-90')}
            />
            <span className="flex-1">{t('newSession.existingProjects')}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-muted-foreground">
              {sortedProjects.length}
            </span>
          </button>
          {existingProjectsOpen ? (
            <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto">
              {sortedProjects.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('newSession.noProjects')}</p>
              ) : (
                sortedProjects.map((p) => {
                  const active = selectedCwd === p.cwd
                  const liveCount = liveCountFor(p.cwd)
                  return (
                    <button
                      type="button"
                      key={p.slug}
                      onClick={() => setSelectedCwd(p.cwd)}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-2 rounded px-3 py-2 text-left text-xs',
                        active
                          ? 'bg-sky-500/15 ring-1 ring-sky-500/50'
                          : 'bg-accent/40 hover:bg-accent',
                      )}
                    >
                      <span className="flex flex-col">
                        <span className="font-medium text-foreground">{basename(p.cwd)}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.cwd}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        {liveCount > 0 ? (
                          <Tooltip content={t('newSession.activeCount', { count: liveCount })}>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              {liveCount}
                            </span>
                          </Tooltip>
                        ) : null}
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {p.sessions.length}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          ) : null}
        </section>

        <section className="p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('newSession.config')}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <FieldSelect
              label={t('newSession.model')}
              value={model}
              options={MODELS}
              defaultValue={defaults.model as Model | null}
              onChange={(v) => {
                setUserTouchedModel(true)
                setModel(v)
              }}
              info={
                <OptionsInfo
                  options={MODELS}
                  prefix="newSession.modelInfo"
                  tooltipKey="newSession.modelInfoTooltip"
                  ariaKey="newSession.modelInfoAria"
                />
              }
            />
            <FieldSelect
              label={t('newSession.effort')}
              value={effort}
              options={EFFORTS}
              defaultValue={defaults.effort as Effort | null}
              onChange={(v) => {
                setUserTouchedEffort(true)
                setEffort(v)
              }}
              info={
                <OptionsInfo
                  options={EFFORTS}
                  prefix="newSession.effortInfo"
                  tooltipKey="newSession.effortInfoTooltip"
                  ariaKey="newSession.effortInfoAria"
                />
              }
            />
            <FieldSelect
              label={t('newSession.permission')}
              value={permissionMode}
              options={PERMISSION_MODES}
              defaultValue={defaults.permissionMode as PermissionMode}
              onChange={(v) => {
                setUserTouchedPermissionMode(true)
                setPermissionMode(v)
              }}
              info={
                <OptionsInfo
                  options={PERMISSION_MODES}
                  prefix="newSession.permissionMode"
                  tooltipKey="newSession.permissionInfoTooltip"
                  ariaKey="newSession.permissionInfoAria"
                />
              }
            />
          </div>
          {permissionMode === 'bypassPermissions' ? (
            <div className="mt-2 flex items-start gap-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{t('newSession.bypassPermissionsWarning')}</span>
            </div>
          ) : null}

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex min-h-[32px] items-center gap-2">
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={isolate}
                  onChange={(e) => {
                    setUserTouchedIsolate(true)
                    setIsolate(e.target.checked)
                  }}
                />
                <GitBranch size={12} className="text-muted-foreground" />
                <span>{t('newSession.isolate')}</span>
              </label>
              <InfoPopover
                ariaLabel={t('newSession.isolateInfoAria')}
                tooltip={t('newSession.isolateInfoTooltip')}
              >
                <p className="whitespace-pre-line">{t('newSession.isolateInfo')}</p>
              </InfoPopover>
              {isolate ? (
                <input
                  type="text"
                  value={worktreeName}
                  onChange={(e) => setWorktreeName(e.target.value)}
                  placeholder={t('newSession.namePlaceholder')}
                  aria-label={t('newSession.name')}
                  className={cn(
                    'min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground focus:border-sky-500 focus:outline-none',
                    nameInvalid && 'border-rose-500',
                  )}
                />
              ) : null}
            </div>
            {isolate && nameInvalid ? (
              <span className="text-[11px] text-rose-400">{t('newSession.nameRules')}</span>
            ) : null}
            {conflictsWithLive && !isolate ? (
              <div className="flex items-start gap-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span>{t('newSession.activeWarning')}</span>
              </div>
            ) : null}
            {conflictsWithLive && isolate && !userTouchedIsolate ? (
              <div className="flex items-start gap-2 rounded bg-sky-500/10 px-2 py-1.5 text-[11px] text-sky-200">
                <GitBranch size={12} className="mt-0.5 shrink-0" />
                <span>{t('newSession.activeAutoIsolate')}</span>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </Modal>
  )
}
