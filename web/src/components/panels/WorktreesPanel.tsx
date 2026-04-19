import { FileDiff, GitBranch, GitMerge, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { Tooltip } from '@/components/ui/Tooltip'
import { useWorktrees } from '@/hooks/useWorktrees'
import { cn } from '@/lib/utils'
import type { Worktree } from '@/types'
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

function formatAge(mtime: number | null): string | null {
  if (!mtime) return null
  const secs = Math.max(0, Math.floor((Date.now() - mtime) / 1000))
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export function WorktreesPanel({
  cwd,
  onClose,
  onLaunchInWorktree,
  onOpenCreate,
  onOpenDiff,
}: Props) {
  const { data, loading, error, refresh } = useWorktrees(cwd)
  const [pendingRemove, setPendingRemove] = useState<Worktree | null>(null)
  const [pendingMerge, setPendingMerge] = useState<Worktree | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const worktrees = data?.worktrees ?? []
  const nonMain = useMemo(() => worktrees.filter((w) => !w.isMain), [worktrees])

  const title = useMemo(() => {
    if (!cwd) return 'Worktrees'
    const last = cwd.split('/').filter(Boolean).pop() || cwd
    return `Worktrees — ${last}`
  }, [cwd])

  const headerExtra = (
    <>
      <Tooltip content="Recarregar">
        <button
          type="button"
          onClick={() => refresh()}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          aria-label="Recarregar worktrees"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
        </button>
      </Tooltip>
      <Tooltip content="Criar novo worktree (abre Nova sessão)">
        <button
          type="button"
          onClick={() => cwd && onOpenCreate(cwd)}
          disabled={!cwd}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label="Criar novo worktree"
        >
          <Plus size={14} />
        </button>
      </Tooltip>
    </>
  )

  const doRemove = async (wt: Worktree) => {
    if (!cwd) return
    setActionError(null)
    try {
      const params = new URLSearchParams({ cwd, path: wt.path })
      const res = await fetch(`/api/worktrees?${params.toString()}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      setActionNotice(`Worktree removido: ${wt.branch ?? wt.path}`)
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
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setActionNotice(`Mergeado ${body.branch} em ${body.base}`)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  const renderRow = (wt: Worktree) => {
    const rel = cwd ? formatRelative(wt.path, cwd) : wt.path
    const age = formatAge(wt.mtime)
    const removeDisabled = wt.isMain || wt.liveSessionCount > 0 || !wt.clean
    const removeReason = wt.isMain
      ? 'Worktree principal não pode ser removido'
      : wt.liveSessionCount > 0
        ? 'Há sessão ativa — feche antes de remover'
        : !wt.clean
          ? `${wt.modifiedCount} arquivo(s) modificado(s) — commite ou descarte antes`
          : 'Remover worktree'
    const mergeDisabled = wt.isMain || wt.ahead === 0 || !wt.clean
    const mergeReason = wt.isMain
      ? 'Worktree principal'
      : wt.ahead === 0
        ? 'Nenhum commit à frente da base'
        : !wt.clean
          ? 'Commite antes de mergear'
          : `Mergear em ${data?.base ?? 'base'} (fast-forward)`

    const items: DropdownMenuItem[] = []
    if (onOpenDiff && !wt.isMain) {
      items.push({ label: 'Ver diff', icon: FileDiff, onSelect: () => onOpenDiff(wt) })
    }
    if (!mergeDisabled) {
      items.push({
        label: `Mergear em ${data?.base ?? 'base'}`,
        icon: GitMerge,
        onSelect: () => setPendingMerge(wt),
      })
    }
    if (!removeDisabled) {
      items.push({
        label: 'Remover worktree',
        icon: Trash2,
        destructive: true,
        onSelect: () => setPendingRemove(wt),
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
                {wt.branch ?? (wt.detached ? '(detached)' : '?')}
              </span>
              {wt.isMain ? (
                <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sky-300">
                  principal
                </span>
              ) : null}
              {wt.liveSessionCount > 0 ? (
                <Tooltip content={`${wt.liveSessionCount} sessão(ões) ativa(s)`}>
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
                {wt.clean ? 'limpo' : `${wt.modifiedCount} modificado(s)`}
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
              {age ? <span>criado há {age}</span> : null}
            </div>
          </div>
          <div className="flex items-start gap-1">
            <Tooltip
              content={`Abrir nova sessão em ${wt.isMain ? 'main' : (wt.branch ?? wt.path)}`}
            >
              <button
                type="button"
                onClick={() => onLaunchInWorktree(wt.path)}
                className="flex h-6 items-center gap-1 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground cursor-pointer"
                aria-label="Nova sessão neste worktree"
              >
                <Play size={11} />
                <span>Nova</span>
              </button>
            </Tooltip>
            {items.length > 0 ? (
              <DropdownMenu items={items} ariaLabel="Ações do worktree" tooltip="Mais ações" />
            ) : (
              <Tooltip
                content={
                  wt.isMain
                    ? 'Nenhuma ação para worktree principal'
                    : removeDisabled && mergeDisabled
                      ? `${removeReason} · ${mergeReason}`
                      : 'Sem ações disponíveis'
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
            Abra uma sessão para ver os worktrees do projeto.
          </div>
        ) : !data && loading ? (
          <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
            Carregando worktrees…
          </div>
        ) : worktrees.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
            Nenhum worktree encontrado. É um repositório git?
          </div>
        ) : nonMain.length === 0 ? (
          <div className="flex flex-col gap-3 p-4">
            {worktrees.map(renderRow)}
            <div className="rounded border border-dashed border-border p-4 text-[11px] text-muted-foreground">
              <p className="mb-2 font-medium text-foreground">Nenhum worktree adicional</p>
              <p>
                Worktrees permitem trabalhar em branches paralelas sem atrapalhar o working tree
                principal. Ideal para rodar várias sessões Claude sem conflitos de arquivos.
              </p>
              <button
                type="button"
                onClick={() => onOpenCreate(cwd)}
                className="mt-3 inline-flex items-center gap-1 rounded bg-sky-700 px-2.5 py-1 text-xs text-white hover:bg-sky-600 cursor-pointer"
              >
                <Plus size={12} />
                Criar primeiro worktree
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">{worktrees.map(renderRow)}</div>
        )}
        {data?.base ? (
          <div className="border-t border-border/60 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
            base: <span className="font-mono text-foreground/80">{data.base}</span>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remover worktree"
        description={
          pendingRemove
            ? `Remover worktree ${pendingRemove.branch ?? pendingRemove.path}? O diretório e a branch local serão removidos (apenas se estiverem limpos).`
            : ''
        }
        confirmLabel="Remover"
        destructive
        onConfirm={async () => {
          if (pendingRemove) await doRemove(pendingRemove)
        }}
        onClose={() => setPendingRemove(null)}
      />

      <ConfirmDialog
        open={!!pendingMerge}
        title="Mergear worktree"
        description={
          pendingMerge
            ? `Mergear ${pendingMerge.branch} em ${data?.base ?? 'base'} (fast-forward). A base será atualizada no worktree principal.`
            : ''
        }
        confirmLabel="Mergear"
        onConfirm={async () => {
          if (pendingMerge) await doMerge(pendingMerge)
        }}
        onClose={() => setPendingMerge(null)}
      />
    </PanelContainer>
  )
}
