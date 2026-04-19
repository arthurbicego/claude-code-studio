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
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            variant={destructive ? 'warn' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="px-4 py-4 text-sm text-muted-foreground">{description}</p>
    </Modal>
  )
}
