import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/ui/Button'

type Props = {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** May be sync or async. The dialog awaits async confirms before closing so callers can
   *  surface errors via their own state (e.g. setActionError) without the modal disappearing
   *  mid-await. */
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const [pending, setPending] = useState(false)
  const confirm = confirmLabel ?? t('common.confirm')
  const cancel = cancelLabel ?? t('common.cancel')

  // The Modal returns null when open=false but ConfirmDialog itself stays mounted, so reset
  // the pending flag when the dialog is dismissed without a confirm completing.
  useEffect(() => {
    if (!open) setPending(false)
  }, [open])

  const handleConfirm = async () => {
    if (pending) return
    setPending(true)
    try {
      await onConfirm()
    } finally {
      setPending(false)
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={title}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
            {cancel}
          </Button>
          <Button
            size="sm"
            variant={destructive ? 'warn' : 'primary'}
            onClick={handleConfirm}
            disabled={pending}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <p className="px-4 py-4 text-sm text-muted-foreground">{description}</p>
    </Modal>
  )
}
