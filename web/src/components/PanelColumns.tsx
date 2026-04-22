import { Fragment } from 'react'
import { ColumnResizer } from '@/components/panels/ColumnResizer'
import { DiffPanel } from '@/components/panels/DiffPanel'
import { PlanPanel } from '@/components/panels/PlanPanel'
import { RowResizer } from '@/components/panels/RowResizer'
import { ShellPanel } from '@/components/panels/ShellPanel'
import { TasksPanel } from '@/components/panels/TasksPanel'
import { WorktreesPanel } from '@/components/panels/WorktreesPanel'
import type { OpenPanel, PanelKind } from '@/types'

const DEFAULT_WIDTH = 352
const DEFAULT_RATIO = 0.5

export function PanelColumns({
  columns,
  widths,
  ratios,
  sessionId,
  cwd,
  onSetWidth,
  onSetRatio,
  onClose,
  onLaunchInWorktree,
  onOpenCreateWorktree,
  onEndWorktreeFromPanel,
}: {
  columns: OpenPanel[][]
  widths: number[]
  ratios: number[]
  sessionId: string | null
  cwd: string
  onSetWidth: (index: number, width: number) => void
  onSetRatio: (index: number, ratio: number) => void
  onClose: (kind: PanelKind, id: string) => void
  onLaunchInWorktree: (path: string) => void
  onOpenCreateWorktree: (cwd: string) => void
  onEndWorktreeFromPanel: (parentCwd: string, worktreePath: string) => void
}) {
  return (
    <>
      {columns.map((col, colIdx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: column index is stable within this render
        <Fragment key={`col-${colIdx}`}>
          <ColumnResizer
            width={widths[colIdx] ?? DEFAULT_WIDTH}
            onChange={(w) => onSetWidth(colIdx, w)}
          />
          <div
            className="flex min-h-0 shrink-0 flex-col"
            style={{ width: `${widths[colIdx] ?? DEFAULT_WIDTH}px` }}
          >
            {col.map((panel, panelIdx) => {
              const ratio = ratios[colIdx] ?? DEFAULT_RATIO
              const grow = col.length > 1 ? (panelIdx === 0 ? ratio : 1 - ratio) : 1
              return (
                <Fragment key={panel.id}>
                  {panelIdx > 0 ? (
                    <RowResizer ratio={ratio} onChange={(r) => onSetRatio(colIdx, r)} />
                  ) : null}
                  <div className="flex min-h-0 min-w-0 flex-col" style={{ flex: `${grow} 1 0%` }}>
                    {panel.kind === 'diff' ? (
                      <DiffPanel
                        sessionId={sessionId}
                        onClose={() => onClose(panel.kind, panel.id)}
                      />
                    ) : panel.kind === 'terminal' ? (
                      <ShellPanel cwd={cwd} onClose={() => onClose(panel.kind, panel.id)} />
                    ) : panel.kind === 'tasks' ? (
                      <TasksPanel
                        sessionId={sessionId}
                        onClose={() => onClose(panel.kind, panel.id)}
                      />
                    ) : panel.kind === 'plan' ? (
                      <PlanPanel
                        sessionId={sessionId}
                        onClose={() => onClose(panel.kind, panel.id)}
                      />
                    ) : (
                      <WorktreesPanel
                        cwd={cwd}
                        onClose={() => onClose(panel.kind, panel.id)}
                        onLaunchInWorktree={onLaunchInWorktree}
                        onOpenCreate={onOpenCreateWorktree}
                        onEndWorktree={onEndWorktreeFromPanel}
                      />
                    )}
                  </div>
                </Fragment>
              )
            })}
          </div>
        </Fragment>
      ))}
    </>
  )
}
