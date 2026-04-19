import { Archive, GitCommit, GitMerge, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import type { Worktree } from '@/types'

export type WorktreeCloseChoice = 'keep' | 'commit' | 'merge' | 'discard'

type Props = {
  open: boolean
  worktree: Worktree | null
  projectCwd: string | null
  base: string | null
  pending: boolean
  error: string | null
  onChoose: (choice: WorktreeCloseChoice, payload: { commitMessage?: string }) => void
  onCancel: () => void
}

export function WorktreeCloseDialog({
  open,
  worktree,
  projectCwd,
  base,
  pending,
  error,
  onChoose,
  onCancel,
}: Props) {
  const { t } = useTranslation()
  const [commitMessage, setCommitMessage] = useState('')

  useEffect(() => {
    if (!open) setCommitMessage('')
  }, [open])

  if (!worktree) return null

  const canMerge = !worktree.isMain && worktree.ahead > 0 && worktree.clean
  const mergeReason = worktree.isMain
    ? t('worktreeClose.mainWorktree')
    : worktree.ahead === 0
      ? t('worktreeClose.nothingAhead')
      : !worktree.clean
        ? t('worktreeClose.uncommitted')
        : ''

  const baseLabel = base ?? t('worktreeClose.mergeBaseFallback')

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onCancel}
      title={t('worktreeClose.title')}
      className="w-[min(580px,94vw)]"
      footer={
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {t('worktreeClose.cancel')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 p-4 text-sm text-foreground">
        <div className="flex flex-col gap-1 rounded border border-border bg-muted/30 p-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">{worktree.branch ?? worktree.path}</span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">{worktree.path}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className={worktree.clean ? 'text-emerald-400' : 'text-amber-400'}>
              {worktree.clean
                ? t('worktreeClose.clean')
                : t('worktreeClose.modifiedCount', { count: worktree.modifiedCount })}
            </span>
            {worktree.ahead > 0 || worktree.behind > 0 ? (
              <span>
                <span className="text-emerald-400">↑{worktree.ahead}</span>{' '}
                <span className="text-rose-400">↓{worktree.behind}</span>
              </span>
            ) : null}
            {worktree.linesAdded > 0 || worktree.linesRemoved > 0 ? (
              <span>
                <span className="text-emerald-400">+{worktree.linesAdded}</span>
                <span className="text-muted-foreground/50">/</span>
                <span className="text-rose-400">-{worktree.linesRemoved}</span>
              </span>
            ) : null}
          </div>
        </div>

        {error ? (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onChoose('keep', {})}
            disabled={pending}
            className="flex items-start gap-2 rounded border border-border bg-background p-3 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            <Archive size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">{t('worktreeClose.keep')}</div>
              <div className="text-[11px] text-muted-foreground">{t('worktreeClose.keepHint')}</div>
            </div>
          </button>

          {!worktree.clean ? (
            <div className="flex flex-col gap-2 rounded border border-border bg-background p-3">
              <div className="flex items-center gap-2">
                <GitCommit size={14} className="shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">{t('worktreeClose.commit')}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {t('worktreeClose.commitHint')}
              </div>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder={t('worktreeClose.commitMessage')}
                rows={2}
                className="rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
                disabled={pending}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={pending || !commitMessage.trim()}
                onClick={() => onChoose('commit', { commitMessage: commitMessage.trim() })}
              >
                {t('worktreeClose.commitButton')}
              </Button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => onChoose('merge', {})}
            disabled={pending || !canMerge}
            className="flex items-start gap-2 rounded border border-border bg-background p-3 text-left hover:bg-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            <GitMerge size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-sm font-medium">
                {t('worktreeClose.merge', { base: baseLabel })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {canMerge
                  ? t('worktreeClose.mergeHint')
                  : t('worktreeClose.mergeUnavailable', { reason: mergeReason })}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChoose('discard', {})}
            disabled={pending || worktree.isMain}
            className="flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/5 p-3 text-left hover:bg-rose-500/10 disabled:pointer-events-none disabled:opacity-50 cursor-pointer"
          >
            <Trash2 size={14} className="mt-0.5 shrink-0 text-rose-400" />
            <div className="flex-1">
              <div className="text-sm font-medium text-rose-200">{t('worktreeClose.discard')}</div>
              <div className="text-[11px] text-rose-300/80">{t('worktreeClose.discardHint')}</div>
            </div>
          </button>
        </div>

        {projectCwd ? (
          <div className="text-[10px] text-muted-foreground">
            {t('worktreeClose.project')} <code className="font-mono">{projectCwd}</code>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
