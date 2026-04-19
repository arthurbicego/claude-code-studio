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
  onConfirm: () => void
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
  const confirm = confirmLabel ?? t('common.confirm')
  const cancel = cancelLabel ?? t('common.cancel')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {cancel}
          </Button>
          <Button
            size="sm"
            variant={destructive ? 'warn' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
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
