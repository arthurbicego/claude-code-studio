import { useTranslation } from 'react-i18next'

export function JsonEditor({
  text,
  error,
  onChange,
  disabled,
}: {
  text: string
  error: string | null
  onChange: (text: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
        rows={6}
        placeholder="{}"
        className={`w-full rounded border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:outline-none disabled:cursor-not-allowed ${
          error ? 'border-red-500/60 focus:border-red-500' : 'border-border focus:border-sky-500'
        }`}
      />
      {error ? (
        <span className="text-[10px] text-red-400">{t('jsonEditor.invalid', { error })}</span>
      ) : (
        <span className="text-[10px] text-muted-foreground">{t('jsonEditor.emptyHint')}</span>
      )}
    </div>
  )
}
