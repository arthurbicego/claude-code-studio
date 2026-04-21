import { useTranslation } from 'react-i18next'
import type { AppConfig, AppConfigBounds } from '@/types'
import { Field, Section } from './atoms'
import { RetentionSection } from './RetentionSection'

export type StandbyUnit = 'seconds' | 'minutes'

const STANDBY_UNIT_OPTIONS: { id: StandbyUnit; labelKey: string }[] = [
  { id: 'seconds', labelKey: 'settings.sessions.unitOption.Seconds' },
  { id: 'minutes', labelKey: 'settings.sessions.unitOption.Minutes' },
]

export function SessionsTab({
  unit,
  value,
  bounds,
  defaults,
  onUnitChange,
  onValueChange,
}: {
  unit: StandbyUnit
  value: string
  bounds: AppConfigBounds | null
  defaults: AppConfig | null
  onUnitChange: (next: StandbyUnit) => void
  onValueChange: (v: string) => void
}) {
  const { t } = useTranslation()
  const factor = unit === 'minutes' ? 60000 : 1000
  const unitLabel =
    unit === 'minutes' ? t('settings.sessions.unit.minutes') : t('settings.sessions.unit.seconds')
  const minMs = bounds?.standbyTimeoutMs.min ?? 60000
  const maxMs = bounds?.standbyTimeoutMs.max ?? 24 * 60 * 60 * 1000
  const defaultMs = defaults?.standbyTimeoutMs ?? 10 * 60 * 1000
  const min = Math.max(1, Math.ceil(minMs / factor))
  const max = Math.floor(maxMs / factor)
  const def = Math.round(defaultMs / factor)

  return (
    <div className="flex flex-col divide-y divide-border">
      <Section title={t('settings.sessions.title')}>
        <Field
          label={t('settings.sessions.standbyLabel', { unit: unitLabel })}
          hint={t('settings.sessions.standbyHelp', { min, max, unit: unitLabel, def })}
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={min}
              max={max}
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              className="w-32 rounded border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground focus:border-sky-500 focus:outline-none"
            />
            <div className="flex rounded border border-border overflow-hidden">
              {STANDBY_UNIT_OPTIONS.map((opt) => {
                const isActive = opt.id === unit
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUnitChange(opt.id)}
                    className={`cursor-pointer px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-sky-700 text-white'
                        : 'bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t(opt.labelKey)}
                  </button>
                )
              })}
            </div>
          </div>
        </Field>
      </Section>
      <RetentionSection />
    </div>
  )
}
