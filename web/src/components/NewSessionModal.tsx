import { AlertTriangle, ArrowUp, Folder, GitBranch, Home } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'
import { useBrowser } from '@/hooks/useBrowser'
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
}

function FieldSelect<T extends string>({
  label,
  value,
  options,
  defaultValue,
  onChange,
}: FieldSelectProps<T>) {
  const { t } = useTranslation()
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
      <select
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
    </label>
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
  const initialModel = (defaults.model as Model) ?? MODELS[0]
  const initialEffort = (defaults.effort as Effort) ?? EFFORTS[2]
  const initialPermission = (defaults.permissionMode as PermissionMode) ?? 'default'

  const [model, setModel] = useState<Model>(initialModel)
  const [effort, setEffort] = useState<Effort>(initialEffort)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(initialPermission)
  const [dangerouslySkipPermissions, setDangerouslySkipPermissions] = useState(false)
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null)
  const [isolate, setIsolate] = useState(false)
  const [userTouchedIsolate, setUserTouchedIsolate] = useState(false)
  const [worktreeName, setWorktreeName] = useState('')

  const browser = useBrowser()

  useEffect(() => {
    if (!open) {
      setSelectedCwd(null)
      setIsolate(false)
      setUserTouchedIsolate(false)
      setWorktreeName('')
      setDangerouslySkipPermissions(false)
      return
    }
    if (initial?.cwd) setSelectedCwd(initial.cwd)
    if (initial?.isolate) {
      setIsolate(true)
      setUserTouchedIsolate(true)
    }
  }, [open, initial])

  const effectiveCwd = selectedCwd ?? browser.data?.path ?? null
  const conflictsWithLive = !!effectiveCwd && liveCwds.has(effectiveCwd)

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
    if (dangerouslySkipPermissions) {
      launchPayload.dangerouslySkipPermissions = true
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
            {t('newSession.config')}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <FieldSelect
              label={t('newSession.model')}
              value={model}
              options={MODELS}
              defaultValue={defaults.model as Model | null}
              onChange={setModel}
            />
            <FieldSelect
              label={t('newSession.effort')}
              value={effort}
              options={EFFORTS}
              defaultValue={defaults.effort as Effort | null}
              onChange={setEffort}
            />
            <FieldSelect
              label={t('newSession.permission')}
              value={permissionMode}
              options={PERMISSION_MODES}
              defaultValue={defaults.permissionMode as PermissionMode}
              onChange={setPermissionMode}
            />
          </div>
        </section>

        <section className="border-b border-border p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('newSession.worktree')}
          </h3>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
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
          {isolate ? (
            <div className="mt-2 flex flex-col gap-1">
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                <span className="text-[10px] uppercase tracking-wide">{t('newSession.name')}</span>
                <input
                  type="text"
                  value={worktreeName}
                  onChange={(e) => setWorktreeName(e.target.value)}
                  placeholder={t('newSession.namePlaceholder')}
                  className={cn(
                    'rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none',
                    nameInvalid && 'border-rose-500',
                  )}
                />
                {nameInvalid ? (
                  <span className="text-[11px] text-rose-400">{t('newSession.nameRules')}</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground/80">
                    {t('newSession.createdFrom', {
                      when: '.claude/worktrees/<nome>',
                      base: 'origin/HEAD',
                    })}
                  </span>
                )}
              </label>
            </div>
          ) : null}
          {conflictsWithLive && !isolate ? (
            <div className="mt-2 flex items-start gap-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>{t('newSession.activeWarning')}</span>
            </div>
          ) : null}
          {conflictsWithLive && isolate && !userTouchedIsolate ? (
            <div className="mt-2 flex items-start gap-2 rounded bg-sky-500/10 px-2 py-1.5 text-[11px] text-sky-200">
              <GitBranch size={12} className="mt-0.5 shrink-0" />
              <span>{t('newSession.activeAutoIsolate')}</span>
            </div>
          ) : null}
        </section>

        <section className="border-b border-border p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('newSession.advanced')}
          </h3>
          <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={dangerouslySkipPermissions}
              onChange={(e) => setDangerouslySkipPermissions(e.target.checked)}
            />
            <span className="flex flex-col gap-0.5">
              <span>{t('newSession.dangerouslySkipPermissions')}</span>
              <span className="text-[11px] text-muted-foreground/80">
                {t('newSession.dangerouslySkipPermissionsHint')}
              </span>
            </span>
          </label>
        </section>

        <section className="border-b border-border p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('newSession.existingProjects')}
          </h3>
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
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
                      'flex items-center justify-between gap-2 rounded px-3 py-2 text-left text-xs cursor-pointer',
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
        </section>

        <section className="flex min-h-0 flex-col p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('newSession.chooseFolder')}
          </h3>
          <div className="mb-2 flex items-center gap-2">
            <Tooltip content={t('newSession.upLevel')}>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => browser.data?.parent && browser.load(browser.data.parent)}
                disabled={!browser.data?.parent}
                aria-label={t('newSession.upLevel')}
              >
                <ArrowUp size={12} />
              </Button>
            </Tooltip>
            <Tooltip content={t('newSession.goHome')}>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => browser.data && browser.load(browser.data.home)}
                aria-label={t('newSession.goHome')}
              >
                <Home size={12} />
              </Button>
            </Tooltip>
            <code
              dir="rtl"
              className="flex-1 truncate rounded bg-background px-2 py-1 text-left text-[11px] text-muted-foreground"
            >
              {browser.data?.path ?? (browser.loading ? t('newSession.loading') : '')}
            </code>
            <Button
              size="xs"
              variant={
                selectedCwd && browser.data && selectedCwd === browser.data.path
                  ? 'primary'
                  : 'ghost'
              }
              disabled={!browser.data?.path}
              onClick={() => browser.data && setSelectedCwd(browser.data.path)}
            >
              {t('newSession.select')}
            </Button>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input type="checkbox" checked={browser.showHidden} onChange={browser.toggleHidden} />
              {t('newSession.hidden')}
            </label>
          </div>
          <div className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1 overflow-y-auto rounded bg-background p-2">
            {browser.error ? (
              <p className="col-span-full px-2 py-3 text-xs text-red-400">{browser.error}</p>
            ) : browser.data && browser.data.entries.length === 0 ? (
              <p className="col-span-full px-2 py-3 text-center text-xs text-muted-foreground">
                {t('newSession.empty')}
              </p>
            ) : (
              browser.data?.entries.map((e) => (
                <button
                  type="button"
                  key={e.name}
                  onClick={() => browser.load(`${browser.data!.path.replace(/\/$/, '')}/${e.name}`)}
                  className="flex items-center gap-1.5 truncate rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent cursor-pointer"
                >
                  <Folder size={12} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{e.name}</span>
                </button>
              ))
            )}
          </div>
        </section>
      </div>
    </Modal>
  )
}
