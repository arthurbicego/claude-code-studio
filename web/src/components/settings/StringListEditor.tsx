import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Tooltip } from '@/components/ui/Tooltip'

export function StringListEditor({
  values,
  onChange,
  placeholder,
  disabled,
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const updateAt = (idx: number, next: string) => {
    const copy = values.slice()
    copy[idx] = next
    onChange(copy)
  }
  const removeAt = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx))
  }
  const add = () => onChange([...values, ''])

  return (
    <div className={`flex flex-col gap-2 ${disabled ? 'opacity-50' : ''}`}>
      {values.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">{t('stringList.empty')}</p>
      ) : (
        values.map((v, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: list is editable and order is meaningful
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={v}
              onChange={(e) => updateAt(idx, e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              className="flex-1 rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none disabled:cursor-not-allowed"
            />
            <Tooltip content={t('stringList.remove')}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                aria-label={t('stringList.remove')}
              >
                <Trash2 size={14} />
              </Button>
            </Tooltip>
          </div>
        ))
      )}
      <div>
        <Button type="button" variant="ghost" size="xs" onClick={add} disabled={disabled}>
          <Plus size={12} /> {t('stringList.add')}
        </Button>
      </div>
    </div>
  )
}
