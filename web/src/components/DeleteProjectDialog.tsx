import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { TruncatingLabel } from '@/components/ui/TruncatingLabel'
import { WorktreeBranchPill } from '@/components/WorktreeBranchPill'
import type { Project } from '@/types'

function basename(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  return parts[parts.length - 1] || cwd
}

type Props = {
  open: boolean
  project: Project | null
  worktrees: Project[]
  onConfirm: (cascade: boolean) => void | Promise<void>
  onClose: () => void
}

export function DeleteProjectDialog({ open, project, worktrees, onConfirm, onClose }: Props) {
  const { t } = useTranslation()
  const [cascade, setCascade] = useState(false)

  useEffect(() => {
    if (open) setCascade(false)
  }, [open])

  if (!project) return null

  const name = basename(project.cwd)
  const count = project.sessions.length
  const worktreeSessionCount = worktrees.reduce((sum, w) => sum + w.sessions.length, 0)
  const hasWorktrees = worktrees.length > 0
  const parentName = name

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dialogs.deleteProject.title')}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            variant="warn"
            onClick={() => {
              onConfirm(hasWorktrees && cascade)
              onClose()
            }}
          >
            {hasWorktrees && cascade
              ? t('dialogs.deleteProject.confirmCascade')
              : t('dialogs.deleteProject.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-4 py-4 text-sm text-muted-foreground">
        <p>
          {count === 0
            ? t('dialogs.deleteProject.empty', { name })
            : t('dialogs.deleteProject.body', { count, name })}
        </p>

        {hasWorktrees ? (
          <>
            <p>
              {t('dialogs.deleteProject.worktreesInfo', {
                count: worktreeSessionCount,
                worktrees: t('dialogs.deleteProject.worktreesCount', { count: worktrees.length }),
              })}
            </p>

            <label className="flex cursor-pointer items-start gap-2 rounded border border-border bg-background/40 px-3 py-2 text-xs text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={cascade}
                onChange={(e) => setCascade(e.target.checked)}
              />
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{t('dialogs.deleteProject.cascadeLabel')}</span>
                <span className="text-[11px] text-muted-foreground">
                  {t('dialogs.deleteProject.cascadeHint')}
                </span>
              </span>
            </label>

            {!cascade ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('dialogs.deleteProject.keepPreviewTitle')}
                </span>
                <ul className="flex flex-col gap-1 rounded border border-border bg-background/40 px-2 py-1.5">
                  {worktrees.map((w) => (
                    <li
                      key={w.slug}
                      className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-xs font-semibold text-foreground"
                    >
                      <TruncatingLabel
                        text={parentName}
                        tooltipClassName="min-w-0 max-w-[50%] shrink"
                      />
                      <span className="flex min-w-0 shrink justify-start">
                        <WorktreeBranchPill branch={w.worktreeOf?.branch ?? null} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  )
}
