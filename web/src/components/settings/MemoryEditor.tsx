import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { type ExpandResult, expandMemoryImports, type MemoryFile } from '@/hooks/useMemory'

function ExpandedPreview({
  result,
  loading,
  error,
}: {
  result: ExpandResult | null
  loading: boolean
  error: string | null
}) {
  if (error) {
    return <p className="text-[10px] text-red-400">Erro ao expandir: {error}</p>
  }
  if (!result && loading) {
    return <p className="text-[10px] text-muted-foreground">Expandindo imports…</p>
  }
  if (!result) {
    return <p className="text-[10px] text-muted-foreground">Preparando preview…</p>
  }
  const issues = result.imports.filter((i) => i.error)
  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-80 w-full overflow-auto rounded border border-border bg-black/30 px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground whitespace-pre-wrap">
        {result.expanded || <span className="text-muted-foreground">(vazio)</span>}
      </pre>
      {result.truncated ? (
        <p className="text-[10px] text-amber-400">
          Limite de profundidade atingido — alguns imports não foram expandidos.
        </p>
      ) : null}
      {result.imports.length > 0 ? (
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            {result.imports.length} import{result.imports.length === 1 ? '' : 's'} resolvido
            {result.imports.length === 1 ? '' : 's'}
            {issues.length > 0 ? ` (${issues.length} com problema)` : ''}
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono">
            {result.imports.map((imp, i) => (
              <li key={`${imp.resolved}:${i}`} className="flex items-baseline gap-2">
                <span
                  className={`w-16 shrink-0 rounded px-1 text-[9px] uppercase ${
                    imp.error ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {imp.error || 'ok'}
                </span>
                <span className="truncate" title={imp.resolved ?? imp.raw}>
                  @{imp.raw}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

export function MemoryEditor({
  data,
  loading,
  loadError,
  onSave,
  onReload,
  placeholder,
  hint,
}: {
  data: MemoryFile | null
  loading: boolean
  loadError: string | null
  onSave: (content: string) => Promise<MemoryFile>
  onReload: () => Promise<void> | void
  placeholder?: string
  hint?: string
}) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [showExpanded, setShowExpanded] = useState(false)
  const [expand, setExpand] = useState<ExpandResult | null>(null)
  const [expanding, setExpanding] = useState(false)
  const [expandError, setExpandError] = useState<string | null>(null)
  const expandReq = useRef(0)

  useEffect(() => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate textarea when data loads
    setText(data?.content ?? '')
    setError(null)
    setSavedAt(null)
    setShowExpanded(false)
    setExpand(null)
    setExpandError(null)
  }, [data])

  const dirty = (data?.content ?? '') !== text
  const hasImports = /^\s*@\S+\s*$/m.test(text)
  const basePath = data?.path ?? null

  useEffect(() => {
    if (!showExpanded || !basePath) return
    const id = ++expandReq.current
    setExpanding(true)
    setExpandError(null)
    const handle = setTimeout(() => {
      expandMemoryImports(text, basePath)
        .then((res) => {
          if (expandReq.current !== id) return
          setExpand(res)
          setExpanding(false)
        })
        .catch((err) => {
          if (expandReq.current !== id) return
          setExpandError(err instanceof Error ? err.message : String(err))
          setExpanding(false)
        })
    }, 250)
    return () => clearTimeout(handle)
  }, [showExpanded, text, basePath])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(text)
      setSavedAt(Date.now())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleRevert = () => {
    setText(data?.content ?? '')
    setError(null)
  }

  if (loading && !data) {
    return <p className="text-xs text-muted-foreground">Carregando…</p>
  }
  if (loadError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-red-400">Erro: {loadError}</p>
        <div>
          <Button type="button" variant="ghost" size="xs" onClick={onReload}>
            Tentar novamente
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {data?.path ? (
        <p className="font-mono text-[10px] text-muted-foreground">{data.path}</p>
      ) : null}
      {hint ? <p className="text-[10px] text-amber-400">{hint}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowExpanded((v) => !v)}
          disabled={!basePath}
          className="cursor-pointer rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {showExpanded ? 'Editar' : 'Preview com imports expandidos'}
        </button>
        {hasImports ? <span className="text-[10px] text-sky-400">contém imports @</span> : null}
      </div>
      {showExpanded ? (
        <ExpandedPreview result={expand} loading={expanding} error={expandError} />
      ) : (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={12}
          placeholder={placeholder}
          className="w-full rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-foreground">
          {error ? (
            <span className="text-red-400">Erro: {error}</span>
          ) : dirty ? (
            'Mudanças não salvas.'
          ) : savedAt ? (
            'Salvo.'
          ) : data?.exists ? (
            ''
          ) : (
            'Arquivo ainda não existe — será criado ao salvar.'
          )}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={handleRevert}
            disabled={!dirty || saving}
          >
            Reverter
          </Button>
          <Button
            type="button"
            variant="primary"
            size="xs"
            onClick={handleSave}
            disabled={!dirty || saving}
          >
            {saving ? 'Salvando…' : 'Salvar memória'}
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Salvar com texto vazio remove o arquivo.</p>
    </div>
  )
}
