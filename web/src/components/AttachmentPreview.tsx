import { FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { UIAttachment } from './AttachmentChip'
import { Modal } from './Modal'

type Props = {
  item: UIAttachment | null
  onClose: () => void
}

export function AttachmentPreviewModal({ item, onClose }: Props) {
  const { t } = useTranslation()
  const [textBody, setTextBody] = useState<string | null>(null)
  const [textError, setTextError] = useState<string | null>(null)

  const kind = item?.kind ?? null
  const objectUrl = item?.objectUrl ?? null
  const name = item?.name ?? ''

  useEffect(() => {
    if (!item || item.kind !== 'text' || !item.objectUrl) {
      setTextBody(null)
      setTextError(null)
      return
    }
    let cancelled = false
    setTextBody(null)
    setTextError(null)
    fetch(item.objectUrl)
      .then((res) => res.text())
      .then((body) => {
        if (!cancelled) setTextBody(body)
      })
      .catch((err: Error) => {
        if (!cancelled) setTextError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [item])

  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title={name || t('attachments.preview.title')}
      className="w-[min(860px,94vw)]"
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/40 p-3">
        {kind === 'image' && objectUrl ? (
          <img
            src={objectUrl}
            alt={name}
            className="max-h-[72vh] max-w-full rounded object-contain"
          />
        ) : kind === 'pdf' && objectUrl ? (
          <iframe
            src={objectUrl}
            title={name}
            className="h-[72vh] w-full rounded border border-border bg-white"
          />
        ) : kind === 'text' ? (
          textError ? (
            <div className="text-sm text-rose-300">
              {t('common.errorPrefix', { message: textError })}
            </div>
          ) : textBody === null ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            <pre className="max-h-[72vh] w-full overflow-auto whitespace-pre-wrap rounded border border-border bg-background p-3 text-xs text-foreground">
              {textBody}
            </pre>
          )
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <FileText size={32} />
            <span className="text-xs">{t('attachments.preview.unavailable')}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
