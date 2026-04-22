import { CheckCircle2, ExternalLink, LogOut, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  prNumber: number
  prUrl: string
  onEndWorktree: () => void
  onDismiss: () => void
}

export function MergedPrBanner({ prNumber, prUrl, onEndWorktree, onDismiss }: Props) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3 border-b border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100">
      <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
      <span className="flex-1">
        {t('mergedPrBanner.message', { number: prNumber })}{' '}
        <a
          href={prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
        >
          {t('mergedPrBanner.viewPr')}
          <ExternalLink size={10} />
        </a>
      </span>
      <button
        type="button"
        onClick={onEndWorktree}
        className="inline-flex items-center gap-1 rounded bg-emerald-600/30 px-2 py-1 text-[11px] font-medium text-emerald-50 hover:bg-emerald-600/50"
      >
        <LogOut size={11} />
        {t('mergedPrBanner.endWorktree')}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('mergedPrBanner.dismiss')}
        className="rounded p-1 text-emerald-200/70 hover:bg-emerald-500/20 hover:text-emerald-50"
      >
        <X size={12} />
      </button>
    </div>
  )
}
