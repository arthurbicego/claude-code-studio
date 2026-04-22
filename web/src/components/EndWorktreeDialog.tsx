import { AlertTriangle, GitBranch, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import type { Worktree } from '@/types'

export type EndWorktreeOptions = {
  commitMessage?: string
  push: boolean
  deleteRemote: boolean
  deleteLocalBranch: boolean
  deleteSessions: boolean
}

type Props = {
  open: boolean
  worktree: Worktree | null
  projectCwd: string | null
  base: string | null
  upstream: string | null
  sessionCount: number
  pending: boolean
  error: string | null
  onConfirm: (opts: EndWorktreeOptions) => void | Promise<void>
  onCancel: () => void
}

export function EndWorktreeDialog({
  open,
  worktree,
  projectCwd,
  base,
  upstream,
  sessionCount,
  pending,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation()
  const [commitMessage, setCommitMessage] = useState('')
  const [push, setPush] = useState(false)
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [deleteLocalBranch, setDeleteLocalBranch] = useState(true)
  const [deleteSessions, setDeleteSessions] = useState(false)

  // Reset to safe defaults whenever the dialog (re)opens. `push` starts on when
  // there are unpushed commits, `deleteRemote` always starts off because it is
  // destructive and visible to collaborators.
  useEffect(() => {
    if (!open) return
    setCommitMessage('')
    setPush((worktree?.ahead ?? 0) > 0)
    setDeleteRemote(false)
    setDeleteLocalBranch(true)
    setDeleteSessions(false)
  }, [open, worktree?.ahead])

  const needsCommit = useMemo(() => !!worktree && !worktree.clean, [worktree])
  const hasLocalCommits = (worktree?.ahead ?? 0) > 0 || needsCommit
  const canDeleteRemote = !!upstream

  if (!worktree) return null

  const commitTrimmed = commitMessage.trim()
  const commitMissing = needsCommit && push && !commitTrimmed
  const confirmDisabled = pending || commitMissing

  const handleConfirm = () => {
    if (confirmDisabled) return
    onConfirm({
      commitMessage: needsCommit && commitTrimmed ? commitTrimmed : undefined,
      push,
      deleteRemote,
      deleteLocalBranch,
      deleteSessions,
    })
  }

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onCancel}
      title={t('endWorktree.title')}
      className="w-[min(620px,94vw)]"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="warn" onClick={handleConfirm} disabled={confirmDisabled}>
            {t('endWorktree.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 p-4 text-sm text-foreground">
        <div className="flex flex-col gap-1 rounded border border-border bg-muted/30 p-3 text-xs">
          <div className="flex items-center gap-2">
            <GitBranch size={12} className="shrink-0 text-muted-foreground" />
            <span className="font-mono font-medium">{worktree.branch ?? worktree.path}</span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">{worktree.path}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className={worktree.clean ? 'text-emerald-400' : 'text-amber-400'}>
              {worktree.clean
                ? t('endWorktree.clean')
                : t('endWorktree.modifiedCount', { count: worktree.modifiedCount })}
            </span>
            {worktree.ahead > 0 || worktree.behind > 0 ? (
              <span>
                <span className="text-emerald-400">↑{worktree.ahead}</span>{' '}
                <span className="text-rose-400">↓{worktree.behind}</span>
              </span>
            ) : null}
            {base ? <span>{t('endWorktree.baseLabel', { base })}</span> : null}
          </div>
        </div>

        {needsCommit ? (
          <div className="flex flex-col gap-2 rounded border border-border bg-background p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle size={14} className="shrink-0 text-amber-400" />
              {t('endWorktree.commit.title')}
            </div>
            <p className="text-[11px] text-muted-foreground">{t('endWorktree.commit.hint')}</p>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder={t('endWorktree.commit.placeholder')}
              rows={2}
              className="rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
              disabled={pending}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <label
            className={`flex cursor-pointer items-start gap-2 rounded border border-border bg-background/40 px-3 py-2 text-xs ${
              !hasLocalCommits ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={push}
              onChange={(e) => setPush(e.target.checked)}
              disabled={pending || !hasLocalCommits}
            />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-semibold">
                <Upload size={12} className="shrink-0 text-muted-foreground" />
                {t('endWorktree.push.label')}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {hasLocalCommits
                  ? t('endWorktree.push.hint', { upstream: upstream ?? 'origin' })
                  : t('endWorktree.push.disabled')}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded border border-border bg-background/40 px-3 py-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deleteLocalBranch}
              onChange={(e) => setDeleteLocalBranch(e.target.checked)}
              disabled={pending}
            />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-semibold">{t('endWorktree.deleteLocal.label')}</span>
              <span className="text-[11px] text-muted-foreground">
                {t('endWorktree.deleteLocal.hint')}
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-2 rounded border border-rose-500/40 bg-rose-500/5 px-3 py-2 text-xs ${
              !canDeleteRemote ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deleteRemote}
              onChange={(e) => setDeleteRemote(e.target.checked)}
              disabled={pending || !canDeleteRemote}
            />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 font-semibold text-rose-200">
                <Trash2 size={12} className="shrink-0 text-rose-400" />
                {t('endWorktree.deleteRemote.label')}
              </span>
              <span className="text-[11px] text-rose-300/80">
                {canDeleteRemote
                  ? t('endWorktree.deleteRemote.hint', { upstream: upstream ?? '' })
                  : t('endWorktree.deleteRemote.noUpstream')}
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer items-start gap-2 rounded border border-border bg-background/40 px-3 py-2 text-xs ${
              sessionCount === 0 ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <input
              type="checkbox"
              className="mt-0.5"
              checked={deleteSessions}
              onChange={(e) => setDeleteSessions(e.target.checked)}
              disabled={pending || sessionCount === 0}
            />
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="font-semibold">
                {t('endWorktree.deleteSessions.label', { count: sessionCount })}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {sessionCount === 0
                  ? t('endWorktree.deleteSessions.none')
                  : t('endWorktree.deleteSessions.hint')}
              </span>
            </span>
          </label>
        </div>

        {error ? (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        {projectCwd ? (
          <div className="text-[10px] text-muted-foreground">
            {t('endWorktree.project')} <code className="font-mono">{projectCwd}</code>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
