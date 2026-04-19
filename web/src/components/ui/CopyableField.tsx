import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
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

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
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
