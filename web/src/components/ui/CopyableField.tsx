import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip } from '@/components/ui/Tooltip'

type Props = {
  label: string
  value: string
  copyAriaLabel?: string
}

export function CopyableField({ label, value, copyAriaLabel }: Props) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

  // Clear the copy-confirmation timer on unmount so React does not warn about state updates
  // on an unmounted component (e.g. when the dialog containing the field closes within 1.2 s
  // of the click).
  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null
        setCopied(false)
      }, 1200)
    } catch {
      /* noop */
    }
  }

  const defaultCopyLabel = t('common.copy', { label })

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="break-all font-mono">{value}</span>
        <Tooltip content={copied ? t('common.copied') : (copyAriaLabel ?? defaultCopyLabel)}>
          <button
            type="button"
            onClick={onCopy}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label={copyAriaLabel ?? defaultCopyLabel}
          >
            {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
