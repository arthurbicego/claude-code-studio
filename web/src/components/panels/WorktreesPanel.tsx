import type { TFunction } from 'i18next'
import { FileDiff, GitBranch, GitMerge, Play, Plus, RefreshCw, Trash, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { Tooltip } from '@/components/ui/Tooltip'
import { useWorktrees } from '@/hooks/useWorktrees'
import { readApiError, translateApiError } from '@/lib/apiError'
import { cn } from '@/lib/utils'
import type { Worktree, WorktreeRemoveResult } from '@/types'
import { PanelContainer } from './PanelContainer'

type Props = {
  cwd: string | null
  onClose: () => void
  onLaunchInWorktree: (worktreePath: string) => void
  onOpenCreate: (cwd: string) => void
  onOpenDiff?: (worktree: Worktree) => void
}

function formatRelative(fullPath: string, cwd: string): string {
  if (fullPath === cwd) return '.'
  if (fullPath.startsWith(`${cwd}/`)) return fullPath.slice(cwd.length + 1)
  return fullPath
}

function formatAge(mtime: number | null, t: TFunction): string | null {
  if (!mtime) return null
  const secs = Math.max(0, Math.floor((Date.now() - mtime) / 1000))
  if (secs < 60) return t('panels.worktrees.ageSeconds', { n: secs })
  const mins = Math.floor(secs / 60)
  if (mins < 60) return t('panels.worktrees.ageMinutes', { n: mins })
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return t('panels.worktrees.ageHours', { n: hrs })
  const days = Math.floor(hrs / 24)
  return t('panels.worktrees.ageDays', { n: days })
}

export function WorktreesPanel({
  cwd,
  onClose,
  onLaunchInWorktree,
  onOpenCreate,
  onOpenDiff,
}: Props) {
  const { t } = useTranslation()
  const { data, loading, error, refresh } = useWorktrees(cwd)
  const [pendingRemove, setPendingRemove] = useState<Worktree | null>(null)
  const [pendingMerge, setPendingMerge] = useState<Worktree | null>(null)
  const [pendingDiscard, setPendingDiscard] = useState<Worktree | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const worktrees = data?.worktrees ?? []
  const nonMain = useMemo(() => worktrees.filter((w) => !w.isMain), [worktrees])

  const title = useMemo(() => {
    if (!cwd) return t('panels.worktrees.title')
    const last = cwd.split('/').filter(Boolean).pop() || cwd
    return t('panels.worktrees.titleWithLast', { last })
  }, [cwd, t])

  const headerExtra = (
    <>
      <Tooltip content={t('panels.worktrees.reload')}>
        <button
          type="button"
          onClick={() => refresh()}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label={t('panels.worktrees.reloadAria')}
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
        </button>
      </Tooltip>
      <Tooltip content={t('panels.worktrees.createTooltip')}>
        <button
          type="button"
          onClick={() => cwd && onOpenCreate(cwd)}
          disabled={!cwd}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={t('panels.worktrees.createAria')}
        >
          <Plus size={14} />
        </button>
      </Tooltip>
    </>
  )

  const buildCleanupNotice = (
    baseKey: 'removed' | 'discarded',
    wt: Worktree,
    body: WorktreeRemoveResult,
  ): string => {
    const name = wt.branch ?? wt.path
    const parts: string[] = [t(`panels.worktrees.${baseKey}`, { name })]
    if (body.branch) {
      parts.push(
        body.branchDeleted
          ? t('panels.worktrees.branchDeleted', { branch: body.branch })
          : t('panels.worktrees.branchKept', { branch: body.branch }),
      )
    }
    if (body.upstream) {
      parts.push(t('panels.worktrees.remoteHint', { upstream: body.upstream }))
    }
    return parts.join(' · ')
  }

  const doRemove = async (wt: Worktree) => {
    if (!cwd) return
    setActionError(null)
    try {
      const params = new URLSearchParams({ cwd, path: wt.path })
      const res = await fetch(`/api/worktrees?${params.toString()}`, { method: 'DELETE' })
      if (!res.ok) {
        const apiErr = await readApiError(res)
        throw new Error(translateApiError(t, apiErr))
      }
      const body = (await res.json()) as WorktreeRemoveResult
      setActionNotice(buildCleanupNotice('removed', wt, body))
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const doDiscard = async (wt: Worktree) => {
    if (!cwd) return
    setActionError(null)
    try {
      const res = await fetch('/api/worktrees/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, path: wt.path }),
      })
      if (!res.ok) {
        const apiErr = await readApiError(res)
        throw new Error(translateApiError(t, apiErr))
      }
      const body = (await res.json()) as WorktreeRemoveResult
      setActionNotice(buildCleanupNotice('discarded', wt, body))
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const doMerge = async (wt: Worktree) => {
    if (!cwd) return
    setActionError(null)
    try {
      const res = await fetch('/api/worktrees/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, path: wt.path, base: data?.base ?? undefined }),
      })
      if (!res.ok) {
        const apiErr = await readApiError(res)
        throw new Error(translateApiError(t, apiErr))
      }
      const body = (await res.json()) as { branch?: string; base?: string }
      setActionNotice(t('panels.worktrees.merged', { branch: body.branch, base: body.base }))
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const renderRow = (wt: Worktree) => {
    const rel = cwd ? formatRelative(wt.path, cwd) : wt.path
    const age = formatAge(wt.mtime, t)
    const removeDisabled = wt.isMain || wt.liveSessionCount > 0 || !wt.clean
    const discardDisabled = wt.isMain || wt.liveSessionCount > 0 || wt.clean
    const removeReason = wt.isMain
      ? t('panels.worktrees.mainCannotRemove')
      : wt.liveSessionCount > 0
        ? t('panels.worktrees.activeBlocking')
        : !wt.clean
          ? t('panels.worktrees.modifiedBeforeRemove', { count: wt.modifiedCount })
          : t('panels.worktrees.remove')
    const mergeDisabled = wt.isMain || wt.ahead === 0 || !wt.clean
    const baseLabel = data?.base ?? t('panels.worktrees.mergeBaseFallback')
    const mergeReason = wt.isMain
      ? t('panels.worktrees.main')
      : wt.ahead === 0
        ? t('panels.worktrees.noCommitsAhead')
        : !wt.clean
          ? t('panels.worktrees.commitBeforeMerge')
          : t('panels.worktrees.ffMerge', { base: baseLabel })

    const items: DropdownMenuItem[] = []
    if (onOpenDiff && !wt.isMain) {
      items.push({
        label: t('panels.worktrees.viewDiff'),
        icon: FileDiff,
        onSelect: () => onOpenDiff(wt),
      })
    }
    if (!mergeDisabled) {
      items.push({
        label: t('panels.worktrees.merge', { base: baseLabel }),
        icon: GitMerge,
        onSelect: () => setPendingMerge(wt),
      })
    }
    if (!removeDisabled) {
      items.push({
        label: t('panels.worktrees.removeWorktree'),
        icon: Trash2,
        destructive: true,
        onSelect: () => setPendingRemove(wt),
      })
    }
    if (!discardDisabled) {
      items.push({
        label: t('panels.worktrees.discardWorktree'),
        icon: Trash,
        destructive: true,
        onSelect: () => setPendingDiscard(wt),
      })
    }

    return (
      <div
        key={wt.path}
        className="flex flex-col gap-1 border-b border-border/60 px-3 py-2 text-xs last:border-b-0"
      >
        <div className="flex items-start gap-2">
          <GitBranch size={12} className="mt-1 shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono font-medium text-foreground">
                {wt.branch ?? (wt.detached ? t('panels.worktrees.detached') : '?')}
              </span>
              {wt.isMain ? (
                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sky-300">
                  {t('panels.worktrees.mainLabel')}
                </span>
              ) : null}
              {wt.liveSessionCount > 0 ? (
                <Tooltip
                  content={t('panels.worktrees.activeCount', { count: wt.liveSessionCount })}
                >
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {wt.liveSessionCount}
                  </span>
                </Tooltip>
              ) : null}
            </div>
            <span className="truncate font-mono text-[10px] text-muted-foreground">{rel}</span>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
              <span className={wt.clean ? 'text-emerald-400' : 'text-amber-400'}>
                {wt.clean
                  ? t('panels.worktrees.clean')
                  : t('panels.worktrees.modifiedCount', { count: wt.modifiedCount })}
              </span>
              {!wt.isMain && (wt.ahead > 0 || wt.behind > 0) ? (
                <span>
                  <span className="text-emerald-400">↑{wt.ahead}</span>{' '}
                  <span className="text-rose-400">↓{wt.behind}</span>
                </span>
              ) : null}
              {!wt.isMain && (wt.linesAdded > 0 || wt.linesRemoved > 0) ? (
                <span>
                  <span className="text-emerald-400">+{wt.linesAdded}</span>
                  <span className="text-muted-foreground/50">/</span>
                  <span className="text-rose-400">-{wt.linesRemoved}</span>
                </span>
              ) : null}
              {age ? <span>{t('panels.worktrees.createdAgo', { age })}</span> : null}
            </div>
          </div>
          <div className="flex items-start gap-1">
            <Tooltip
              content={t('panels.worktrees.openSessionAt', {
                path: wt.isMain ? 'main' : (wt.branch ?? wt.path),
              })}
            >
              <button
                type="button"
                onClick={() => onLaunchInWorktree(wt.path)}
                className="flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                aria-label={t('panels.worktrees.newSessionAria')}
              >
                <Play size={11} />
                <span>{t('panels.worktrees.newSession')}</span>
              </button>
            </Tooltip>
            {items.length > 0 ? (
              <DropdownMenu
                items={items}
                ariaLabel={t('panels.worktrees.actionsAria')}
                tooltip={t('panels.worktrees.actionsTooltip')}
              />
            ) : (
              <Tooltip
                content={
                  wt.isMain
                    ? t('panels.worktrees.noActionsMain')
                    : removeDisabled && mergeDisabled
                      ? `${removeReason} · ${mergeReason}`
                      : t('panels.worktrees.noActions')
                }
              >
                <span className="flex h-6 w-6 items-center justify-center text-muted-foreground/40">
                  ·
                </span>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <PanelContainer title={title} onClose={onClose} headerExtra={headerExtra}>
      <div className="flex h-full flex-col">
        {error ? (
          <div className="border-b border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300">
            {error}
          </div>
        ) : null}
        {actionError ? (
          <div className="flex items-center justify-between gap-2 border-b border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300">
            <span className="truncate">{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="rounded px-1 text-rose-200 hover:bg-rose-500/20"
            >
              ×
            </button>
          </div>
        ) : null}
        {actionNotice ? (
          <div className="flex items-center justify-between gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-300">
            <span className="truncate">{actionNotice}</span>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="rounded px-1 text-emerald-200 hover:bg-emerald-500/20"
            >
              ×
            </button>
          </div>
        ) : null}
        {!cwd ? (
          <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
            {t('panels.worktrees.openSessionFirst')}
          </div>
        ) : !data && loading ? (
          <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
            {t('panels.worktrees.loading')}
          </div>
        ) : worktrees.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
            {t('panels.worktrees.notARepo')}
          </div>
        ) : nonMain.length === 0 ? (
          <div className="flex flex-col gap-3 p-4">
            {worktrees.map(renderRow)}
            <div className="rounded border border-dashed border-border p-4 text-[11px] text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">{t('panels.worktrees.emptyTitle')}</p>
              <p>{t('panels.worktrees.emptyHelp')}</p>
              <button
                type="button"
                onClick={() => onOpenCreate(cwd)}
                className="mt-3 inline-flex items-center gap-1 rounded bg-sky-700 px-2.5 py-1 text-xs text-white hover:bg-sky-600 cursor-pointer"
              >
                <Plus size={12} />
                {t('panels.worktrees.createFirst')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">{worktrees.map(renderRow)}</div>
        )}
        {data?.base ? (
          <div className="border-t border-border/60 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
            {t('panels.worktrees.baseLabel')}{' '}
            <span className="font-mono text-foreground/80">{data.base}</span>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        title={t('panels.worktrees.removeConfirmTitle')}
        description={
          pendingRemove
            ? t('panels.worktrees.removeConfirmBody', {
                name: pendingRemove.branch ?? pendingRemove.path,
              })
            : ''
        }
        confirmLabel={t('panels.worktrees.removeConfirm')}
        destructive
        onConfirm={async () => {
          if (pendingRemove) await doRemove(pendingRemove)
        }}
        onClose={() => setPendingRemove(null)}
      />

      <ConfirmDialog
        open={!!pendingMerge}
        title={t('panels.worktrees.mergeConfirmTitle')}
        description={
          pendingMerge
            ? t('panels.worktrees.mergeConfirmBody', {
                branch: pendingMerge.branch,
                base: data?.base ?? t('panels.worktrees.mergeBaseFallback'),
              })
            : ''
        }
        confirmLabel={t('panels.worktrees.mergeConfirm')}
        onConfirm={async () => {
          if (pendingMerge) await doMerge(pendingMerge)
        }}
        onClose={() => setPendingMerge(null)}
      />

      <ConfirmDialog
        open={!!pendingDiscard}
        title={t('panels.worktrees.discardConfirmTitle')}
        description={
          pendingDiscard
            ? t('panels.worktrees.discardConfirmBody', {
                name: pendingDiscard.branch ?? pendingDiscard.path,
                count: pendingDiscard.modifiedCount,
              })
            : ''
        }
        confirmLabel={t('panels.worktrees.discardConfirm')}
        destructive
        onConfirm={async () => {
          if (pendingDiscard) await doDiscard(pendingDiscard)
        }}
        onClose={() => setPendingDiscard(null)}
      />
    </PanelContainer>
  )
}
