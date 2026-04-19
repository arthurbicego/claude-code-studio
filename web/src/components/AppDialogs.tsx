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
  return (
    <>
      <ConfirmDialog
        open={!!pendingArchive}
        title={pendingArchive?.action === 'unarchive' ? 'Desarquivar sessão' : 'Arquivar sessão'}
        description={
          pendingArchive
            ? pendingArchive.action === 'unarchive'
              ? `A sessão (${pendingArchive.id.slice(0, 8)}…) voltará para o histórico.`
              : `A sessão (${pendingArchive.id.slice(0, 8)}…) será movida para Arquivadas.`
            : ''
        }
        confirmLabel={pendingArchive?.action === 'unarchive' ? 'Desarquivar' : 'Arquivar'}
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
        title="Abrir no VS Code"
        description={
          pendingVSCodeOpen
            ? `O diretório "${pendingVSCodeOpen.label}" será aberto no VS Code.`
            : ''
        }
        confirmLabel="Abrir"
        onConfirm={onConfirmVSCode}
        onClose={onCloseVSCode}
      />

      <ConfirmDialog
        open={!!pendingProjectArchive}
        title="Arquivar sessões do projeto"
        description={
          pendingProjectArchive
            ? (() => {
                const count = pendingProjectArchive.sessions.filter((s) => !s.archived).length
                const name =
                  pendingProjectArchive.cwd.split('/').filter(Boolean).pop() ||
                  pendingProjectArchive.cwd
                return count === 0
                  ? `Não há sessões ativas para arquivar em "${name}".`
                  : `${count} ${count === 1 ? 'sessão ativa será movida' : 'sessões ativas serão movidas'} para Arquivadas (projeto: ${name}).`
              })()
            : ''
        }
        confirmLabel="Arquivar todas"
        onConfirm={onConfirmProjectArchive}
        onClose={onCloseProjectArchive}
      />

      <ConfirmDialog
        open={!!pendingProjectDelete}
        title="Apagar sessões do projeto definitivamente"
        description={
          pendingProjectDelete
            ? (() => {
                const count = pendingProjectDelete.sessions.length
                const name =
                  pendingProjectDelete.cwd.split('/').filter(Boolean).pop() ||
                  pendingProjectDelete.cwd
                return count === 0
                  ? `Não há sessões para apagar em "${name}".`
                  : `Esta ação remove do disco ${count} ${count === 1 ? 'sessão' : 'sessões'} do projeto "${name}". Não pode ser desfeita.`
              })()
            : ''
        }
        confirmLabel="Apagar todas"
        destructive
        onConfirm={onConfirmProjectDelete}
        onClose={onCloseProjectDelete}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Apagar sessão definitivamente"
        description={
          pendingDelete
            ? `Esta ação remove o arquivo da sessão (${pendingDelete.id.slice(0, 8)}…) do disco. Não pode ser desfeita.`
            : ''
        }
        confirmLabel="Apagar"
        destructive
        onConfirm={onConfirmDelete}
        onClose={onCloseDelete}
      />
    </>
  )
}
