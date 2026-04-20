import { AlertCircle, FileText, Loader2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { Attachment, AttachmentKind } from '@/types'

export type UIAttachment = {
  tempId: string
  name: string
  size: number
  mime: string
  kind: AttachmentKind
  state: 'uploading' | 'ready' | 'failed'
  objectUrl?: string
  attachment?: Attachment
  error?: string
}

type ChipProps = {
  item: UIAttachment
  onRemove: (tempId: string) => void
  onRetry?: (tempId: string) => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function displayName(item: UIAttachment, fallbackScreenshot: string): string {
  if (item.kind === 'image' && (item.name === 'image.png' || !item.name)) {
    return fallbackScreenshot
  }
  return item.name
}

export function AttachmentChip({ item, onRemove, onRetry }: ChipProps) {
  const { t } = useTranslation()
  const failed = item.state === 'failed'
  const uploading = item.state === 'uploading'
  const name = displayName(item, t('attachments.screenshot'))

  const handleClick = () => {
    if (failed && onRetry) onRetry(item.tempId)
  }

  return (
    <div
      className={cn(
        'group relative inline-flex max-w-[240px] items-center gap-2 rounded border bg-background px-2 py-1.5 text-xs shadow-sm',
        failed
          ? 'border-rose-500/60 bg-rose-500/10 text-rose-200'
          : 'border-border text-foreground',
      )}
      title={failed ? item.error || t('attachments.uploadFailed') : name}
    >
      {item.kind === 'image' && item.objectUrl ? (
        <button
          type="button"
          onClick={handleClick}
          className="h-9 w-9 shrink-0 overflow-hidden rounded border border-border bg-muted"
          aria-label={name}
        >
          <img src={item.objectUrl} alt={name} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-muted text-muted-foreground">
          {failed ? <AlertCircle size={14} /> : <FileText size={14} />}
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {item.kind === 'pdf' ? (
            <span className="rounded bg-rose-500/20 px-1 py-[1px] font-semibold text-rose-200">
              {t('attachments.pdfBadge')}
            </span>
          ) : null}
          <span>{formatSize(item.size)}</span>
        </span>
      </div>
      {uploading ? (
        <Loader2 size={12} className="shrink-0 animate-spin text-muted-foreground" />
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(item.tempId)
        }}
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 hover:bg-accent hover:text-foreground hover:opacity-100"
        aria-label={t('attachments.remove')}
        title={item.state === 'ready' ? t('attachments.injectedHint') : t('attachments.remove')}
      >
        <X size={12} />
      </button>
    </div>
  )
}

type RowProps = {
  items: UIAttachment[]
  onRemove: (tempId: string) => void
  onRetry?: (tempId: string) => void
  className?: string
}

export function AttachmentChipRow({ items, onRemove, onRetry, className }: RowProps) {
  if (items.length === 0) return null
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {items.map((item) => (
        <AttachmentChip key={item.tempId} item={item} onRemove={onRemove} onRetry={onRetry} />
      ))}
    </div>
  )
}
