import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { type ExpandResult, expandMemoryImports, type MemoryFile } from '@/hooks/useMemory'
import { useSaveStatus } from '@/hooks/useSaveStatus'

function ExpandedPreview({
  result,
  loading,
  error,
}: {
  result: ExpandResult | null
  loading: boolean
  error: string | null
}) {
  const { t } = useTranslation()
  if (error) {
    return (
      <p className="text-[10px] text-red-400">
        {t('settings.memory.editor.expandError', { error })}
      </p>
    )
  }
  if (!result && loading) {
    return (
      <p className="text-[10px] text-muted-foreground">{t('settings.memory.editor.expanding')}</p>
    )
  }
  if (!result) {
    return (
      <p className="text-[10px] text-muted-foreground">{t('settings.memory.editor.preparing')}</p>
    )
  }
  const issues = result.imports.filter((i) => i.error)
  return (
    <div className="flex flex-col gap-2">
      <pre className="max-h-80 w-full overflow-auto rounded border border-border bg-black/30 px-2 py-1.5 font-mono text-[11px] leading-snug text-foreground whitespace-pre-wrap">
        {result.expanded || (
          <span className="text-muted-foreground">{t('settings.memory.editor.empty')}</span>
        )}
      </pre>
      {result.truncated ? (
        <p className="text-[10px] text-amber-400">{t('settings.memory.editor.depthExceeded')}</p>
      ) : null}
      {result.imports.length > 0 ? (
        <details className="text-[10px] text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">
            {t('settings.memory.editor.importsResolved', { count: result.imports.length })}
            {issues.length > 0
              ? t('settings.memory.editor.importsIssues', { count: issues.length })
              : ''}
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 font-mono">
            {result.imports.map((imp, i) => (
              <li key={`${imp.resolved}:${i}`} className="flex items-baseline gap-2">
                <span
                  className={`w-16 shrink-0 rounded px-1 text-[9px] uppercase ${
                    imp.error ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {imp.error || t('settings.memory.editor.ok')}
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
  const { t } = useTranslation()
  const { setSaving, setSaved, setError: reportSaveError } = useSaveStatus()
  const [text, setText] = useState('')
  const [showExpanded, setShowExpanded] = useState(false)
  const [expand, setExpand] = useState<ExpandResult | null>(null)
  const [expanding, setExpanding] = useState(false)
  const [expandError, setExpandError] = useState<string | null>(null)
  const expandReq = useRef(0)
  const lastSavedTextRef = useRef<string>('')

  useEffect(() => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate textarea when data loads
    const initial = data?.content ?? ''
    setText(initial)
    lastSavedTextRef.current = initial
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

  // Auto-save (debounced) when text differs from the last saved value.
  useEffect(() => {
    if (!data) return
    if (text === lastSavedTextRef.current) return
    const handle = window.setTimeout(async () => {
      setSaving()
      try {
        await onSave(text)
        lastSavedTextRef.current = text
        setSaved()
      } catch (err) {
        reportSaveError(err instanceof Error ? err.message : String(err))
      }
    }, 800)
    return () => window.clearTimeout(handle)
  }, [text, data, onSave, setSaving, setSaved, reportSaveError])

  const handleRevert = () => {
    setText(data?.content ?? '')
  }

  if (loading && !data) {
    return <p className="text-xs text-muted-foreground">{t('settings.memory.editor.loading')}</p>
  }
  if (loadError) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-red-400">
          {t('settings.memory.editor.loadError', { error: loadError })}
        </p>
        <div>
          <Button type="button" variant="ghost" size="xs" onClick={onReload}>
            {t('settings.memory.editor.tryAgain')}
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
          {showExpanded ? t('settings.memory.editor.edit') : t('settings.memory.editor.preview')}
        </button>
        {hasImports ? (
          <span className="text-[10px] text-sky-400">
            {t('settings.memory.editor.containsImports')}
          </span>
        ) : null}
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
          {data?.exists ? '' : t('settings.memory.editor.willCreate')}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={handleRevert}
          disabled={!dirty}
        >
          {t('settings.memory.editor.revert')}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">{t('settings.memory.editor.emptyHint')}</p>
    </div>
  )
}
