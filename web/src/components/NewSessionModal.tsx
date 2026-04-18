import { useMemo, useState } from 'react'
import { ArrowUp, Folder, Home } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { useBrowser } from '@/hooks/useBrowser'
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

function labelWithDefault<T extends string>(value: T, defaultValue: T | null | undefined): string {
  return value === defaultValue ? `${value} (padrão)` : value
}

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

function FieldSelect<T extends string>({ label, value, options, defaultValue, onChange }: FieldSelectProps<T>) {
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
            {labelWithDefault(o, defaultValue)}
          </option>
        ))}
      </select>
    </label>
  )
}

export function NewSessionModal({ open, defaults, projects, onClose, onLaunch }: Props) {
  const initialModel = (defaults.model as Model) ?? MODELS[0]
  const initialEffort = (defaults.effort as Effort) ?? EFFORTS[2]
  const initialPermission = (defaults.permissionMode as PermissionMode) ?? 'default'

  const [model, setModel] = useState<Model>(initialModel)
  const [effort, setEffort] = useState<Effort>(initialEffort)
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(initialPermission)

  const browser = useBrowser()

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.cwd.localeCompare(b.cwd)),
    [projects],
  )

  const launch = (cwd: string) => {
    const sessionKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    onLaunch({ sessionKey, cwd, model, effort, permissionMode })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova sessão"
      className="w-[min(720px,94vw)]"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!browser.data?.path}
            onClick={() => browser.data && launch(browser.data.path)}
          >
            Usar esta pasta
          </Button>
        </>
      }
    >
      <div className="flex flex-col overflow-y-auto">
        <section className="border-b border-border p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Configuração
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <FieldSelect label="Modelo" value={model} options={MODELS} defaultValue={defaults.model as Model | null} onChange={setModel} />
            <FieldSelect label="Effort" value={effort} options={EFFORTS} defaultValue={defaults.effort as Effort | null} onChange={setEffort} />
            <FieldSelect label="Permissão" value={permissionMode} options={PERMISSION_MODES} defaultValue={defaults.permissionMode as PermissionMode} onChange={setPermissionMode} />
          </div>
        </section>

        <section className="border-b border-border p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Projetos existentes
          </h3>
          <div className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {sortedProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum projeto ainda.</p>
            ) : (
              sortedProjects.map((p) => (
                <button
                  key={p.slug}
                  onClick={() => launch(p.cwd)}
                  className="flex items-center justify-between gap-2 rounded bg-accent/40 px-3 py-2 text-left text-xs hover:bg-accent cursor-pointer"
                >
                  <span className="flex flex-col">
                    <span className="font-medium text-foreground">{basename(p.cwd)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{p.cwd}</span>
                  </span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {p.sessions.length}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="flex min-h-0 flex-col p-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ou escolher outra pasta
          </h3>
          <div className="mb-2 flex items-center gap-2">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => browser.data?.parent && browser.load(browser.data.parent)}
              disabled={!browser.data?.parent}
              title="Subir um nível"
            >
              <ArrowUp size={12} />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => browser.data && browser.load(browser.data.home)}
              title="Ir para HOME"
            >
              <Home size={12} />
            </Button>
            <code
              dir="rtl"
              className="flex-1 truncate rounded bg-background px-2 py-1 text-left text-[11px] text-muted-foreground"
            >
              {browser.data?.path ?? (browser.loading ? 'carregando…' : '')}
            </code>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={browser.showHidden}
                onChange={browser.toggleHidden}
              />
              ocultos
            </label>
          </div>
          <div className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1 overflow-y-auto rounded bg-background p-2">
            {browser.error ? (
              <p className="col-span-full px-2 py-3 text-xs text-red-400">{browser.error}</p>
            ) : browser.data && browser.data.entries.length === 0 ? (
              <p className="col-span-full px-2 py-3 text-center text-xs text-muted-foreground">
                Pasta vazia
              </p>
            ) : (
              browser.data?.entries.map((e) => (
                <button
                  key={e.name}
                  onClick={() =>
                    browser.load(`${browser.data!.path.replace(/\/$/, '')}/${e.name}`)
                  }
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
