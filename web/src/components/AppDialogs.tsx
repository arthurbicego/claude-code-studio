import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { type WorktreeCloseChoice, WorktreeCloseDialog } from '@/components/WorktreeCloseDialog'
import type { Project, SessionMeta, Worktree } from '@/types'

export type PendingArchive = { id: string; action: 'archive' | 'unarchive' }
export type PendingVSCodeOpen = { path: string; label: string }
export type PendingCloseWorktree = {
  sessionKey: string
  worktree: Worktree
  base: string | null
  projectCwd: string
}

export function AppDialogs({
  pendingArchive,
  onConfirmArchive,
  onCloseArchive,
  pendingCloseWorktree,
  closingBusy,
  closingError,
  onChooseWorktreeClose,
  onCancelWorktreeClose,
  pendingVSCodeOpen,
  onConfirmVSCode,
  onCloseVSCode,
  pendingProjectArchive,
  onConfirmProjectArchive,
  onCloseProjectArchive,
  pendingProjectDelete,
  onConfirmProjectDelete,
  onCloseProjectDelete,
  pendingDelete,
  onConfirmDelete,
  onCloseDelete,
}: {
  pendingArchive: PendingArchive | null
  onConfirmArchive: () => void | Promise<void>
  onCloseArchive: () => void

  pendingCloseWorktree: PendingCloseWorktree | null
  closingBusy: boolean
  closingError: string | null
  onChooseWorktreeClose: (
    choice: WorktreeCloseChoice,
    payload: { commitMessage?: string },
  ) => void | Promise<void>
  onCancelWorktreeClose: () => void

  pendingVSCodeOpen: PendingVSCodeOpen | null
  onConfirmVSCode: () => void
  onCloseVSCode: () => void

  pendingProjectArchive: Project | null
  onConfirmProjectArchive: () => void | Promise<void>
  onCloseProjectArchive: () => void

  pendingProjectDelete: Project | null
  onConfirmProjectDelete: () => void | Promise<void>
  onCloseProjectDelete: () => void

  pendingDelete: SessionMeta | null
  onConfirmDelete: () => void | Promise<void>
  onCloseDelete: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <ConfirmDialog
        open={!!pendingArchive}
        title={
          pendingArchive?.action === 'unarchive'
            ? t('dialogs.archiveSession.unarchiveTitle')
            : t('dialogs.archiveSession.archiveTitle')
        }
        description={
          pendingArchive
            ? pendingArchive.action === 'unarchive'
              ? t('dialogs.archiveSession.unarchiveBody', { id: pendingArchive.id.slice(0, 8) })
              : t('dialogs.archiveSession.archiveBody', { id: pendingArchive.id.slice(0, 8) })
            : ''
        }
        confirmLabel={
          pendingArchive?.action === 'unarchive'
            ? t('dialogs.archiveSession.unarchiveConfirm')
            : t('dialogs.archiveSession.archiveConfirm')
        }
        onConfirm={onConfirmArchive}
        onClose={onCloseArchive}
      />

      <WorktreeCloseDialog
        open={!!pendingCloseWorktree}
        worktree={pendingCloseWorktree?.worktree ?? null}
        projectCwd={pendingCloseWorktree?.projectCwd ?? null}
        base={pendingCloseWorktree?.base ?? null}
        pending={closingBusy}
        error={closingError}
        onChoose={onChooseWorktreeClose}
        onCancel={onCancelWorktreeClose}
      />

      <ConfirmDialog
        open={!!pendingVSCodeOpen}
        title={t('dialogs.openVscode.title')}
        description={
          pendingVSCodeOpen ? t('dialogs.openVscode.body', { label: pendingVSCodeOpen.label }) : ''
        }
        confirmLabel={t('dialogs.openVscode.confirm')}
        onConfirm={onConfirmVSCode}
        onClose={onCloseVSCode}
      />

      <ConfirmDialog
        open={!!pendingProjectArchive}
        title={t('dialogs.archiveProject.title')}
        description={
          pendingProjectArchive
            ? (() => {
                const count = pendingProjectArchive.sessions.filter((s) => !s.archived).length
                const name =
                  pendingProjectArchive.cwd.split('/').filter(Boolean).pop() ||
                  pendingProjectArchive.cwd
                return count === 0
                  ? t('dialogs.archiveProject.empty', { name })
                  : t('dialogs.archiveProject.body', { count, name })
              })()
            : ''
        }
        confirmLabel={t('dialogs.archiveProject.confirm')}
        onConfirm={onConfirmProjectArchive}
        onClose={onCloseProjectArchive}
      />

      <ConfirmDialog
        open={!!pendingProjectDelete}
        title={t('dialogs.deleteProject.title')}
        description={
          pendingProjectDelete
            ? (() => {
                const count = pendingProjectDelete.sessions.length
                const name =
                  pendingProjectDelete.cwd.split('/').filter(Boolean).pop() ||
                  pendingProjectDelete.cwd
                return count === 0
                  ? t('dialogs.deleteProject.empty', { name })
                  : t('dialogs.deleteProject.body', { count, name })
              })()
            : ''
        }
        confirmLabel={t('dialogs.deleteProject.confirm')}
        destructive
        onConfirm={onConfirmProjectDelete}
        onClose={onCloseProjectDelete}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title={t('dialogs.deleteSession.title')}
        description={
          pendingDelete ? t('dialogs.deleteSession.body', { id: pendingDelete.id.slice(0, 8) }) : ''
        }
        confirmLabel={t('dialogs.deleteSession.confirm')}
        destructive
        onConfirm={onConfirmDelete}
        onClose={onCloseDelete}
      />
    </>
  )
}
