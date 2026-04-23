import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DeleteProjectDialog } from '@/components/DeleteProjectDialog'
import { EndWorktreeDialog, type EndWorktreeOptions } from '@/components/EndWorktreeDialog'
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
export type PendingEndWorktree = {
  project: Project
  worktree: Worktree
  projectCwd: string
  base: string | null
  sessionCount: number
}
export type PendingProjectArchive = { project: Project; action: 'archive' | 'unarchive' }
export type PendingSectionArchive = {
  ids: string[]
  sectionTitle: string
  action: 'archive' | 'unarchive'
  filtered: boolean
}
export type PendingSectionDelete = { ids: string[]; sectionTitle: string; filtered: boolean }

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
  pendingEndWorktree,
  endingBusy,
  endingError,
  onConfirmEndWorktree,
  onCancelEndWorktree,
  pendingSectionArchive,
  onConfirmSectionArchive,
  onCloseSectionArchive,
  pendingSectionDelete,
  onConfirmSectionDelete,
  onCloseSectionDelete,
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

  pendingProjectArchive: PendingProjectArchive | null
  onConfirmProjectArchive: () => void | Promise<void>
  onCloseProjectArchive: () => void

  pendingProjectDelete: { project: Project; worktrees: Project[] } | null
  onConfirmProjectDelete: (cascade: boolean) => void | Promise<void>
  onCloseProjectDelete: () => void

  pendingDelete: SessionMeta | null
  onConfirmDelete: () => void | Promise<void>
  onCloseDelete: () => void

  pendingEndWorktree: PendingEndWorktree | null
  endingBusy: boolean
  endingError: string | null
  onConfirmEndWorktree: (opts: EndWorktreeOptions) => void | Promise<void>
  onCancelEndWorktree: () => void

  pendingSectionArchive: PendingSectionArchive | null
  onConfirmSectionArchive: () => void | Promise<void>
  onCloseSectionArchive: () => void

  pendingSectionDelete: PendingSectionDelete | null
  onConfirmSectionDelete: () => void | Promise<void>
  onCloseSectionDelete: () => void
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
        title={
          pendingProjectArchive?.action === 'unarchive'
            ? t('dialogs.archiveProject.unarchiveTitle')
            : t('dialogs.archiveProject.title')
        }
        description={
          pendingProjectArchive
            ? (() => {
                const { project, action } = pendingProjectArchive
                const count = project.sessions.filter((s) =>
                  action === 'unarchive' ? s.archived : !s.archived,
                ).length
                const name = project.cwd.split('/').filter(Boolean).pop() || project.cwd
                if (action === 'unarchive') {
                  return count === 0
                    ? t('dialogs.archiveProject.unarchiveEmpty', { name })
                    : t('dialogs.archiveProject.unarchiveBody', { count, name })
                }
                return count === 0
                  ? t('dialogs.archiveProject.empty', { name })
                  : t('dialogs.archiveProject.body', { count, name })
              })()
            : ''
        }
        confirmLabel={
          pendingProjectArchive?.action === 'unarchive'
            ? t('dialogs.archiveProject.unarchiveConfirm')
            : t('dialogs.archiveProject.confirm')
        }
        onConfirm={onConfirmProjectArchive}
        onClose={onCloseProjectArchive}
      />

      <DeleteProjectDialog
        open={!!pendingProjectDelete}
        project={pendingProjectDelete?.project ?? null}
        worktrees={pendingProjectDelete?.worktrees ?? []}
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

      <EndWorktreeDialog
        open={!!pendingEndWorktree}
        worktree={pendingEndWorktree?.worktree ?? null}
        projectCwd={pendingEndWorktree?.projectCwd ?? null}
        base={pendingEndWorktree?.base ?? null}
        upstream={pendingEndWorktree?.worktree?.upstream ?? null}
        sessionCount={pendingEndWorktree?.sessionCount ?? 0}
        pending={endingBusy}
        error={endingError}
        onConfirm={onConfirmEndWorktree}
        onCancel={onCancelEndWorktree}
      />

      <ConfirmDialog
        open={!!pendingSectionArchive}
        title={
          pendingSectionArchive?.action === 'unarchive'
            ? t('dialogs.sectionArchive.unarchiveTitle')
            : t('dialogs.sectionArchive.title')
        }
        description={
          pendingSectionArchive
            ? (() => {
                const { ids, sectionTitle, action, filtered } = pendingSectionArchive
                const base = action === 'unarchive' ? 'unarchive' : 'archive'
                const suffix = filtered ? 'Filtered' : 'All'
                const key = `dialogs.sectionArchive.${base}Body${suffix}`
                return t(key, { count: ids.length, section: sectionTitle })
              })()
            : ''
        }
        confirmLabel={
          pendingSectionArchive?.action === 'unarchive'
            ? t('dialogs.sectionArchive.unarchiveConfirm')
            : t('dialogs.sectionArchive.confirm')
        }
        onConfirm={onConfirmSectionArchive}
        onClose={onCloseSectionArchive}
      />

      <ConfirmDialog
        open={!!pendingSectionDelete}
        title={t('dialogs.sectionDelete.title')}
        description={
          pendingSectionDelete
            ? (() => {
                const { ids, sectionTitle, filtered } = pendingSectionDelete
                const key = filtered
                  ? 'dialogs.sectionDelete.bodyFiltered'
                  : 'dialogs.sectionDelete.bodyAll'
                return t(key, { count: ids.length, section: sectionTitle })
              })()
            : ''
        }
        confirmLabel={t('dialogs.sectionDelete.confirm')}
        destructive
        onConfirm={onConfirmSectionDelete}
        onClose={onCloseSectionDelete}
      />
    </>
  )
}
