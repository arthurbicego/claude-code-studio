import { ARCHIVE_RETENTION_MAX_DAYS, ARCHIVE_RETENTION_MIN_DAYS } from '@shared/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { usePrefs } from '@/hooks/usePrefs'
import { Field, Section, ToggleField } from './atoms'

const DEFAULT_DAYS = 30

function clampDays(n: number): number {
  return Math.min(ARCHIVE_RETENTION_MAX_DAYS, Math.max(ARCHIVE_RETENTION_MIN_DAYS, n))
}

export function RetentionSection() {
  const { t } = useTranslation()
  const { prefs, setAutoDeleteArchivedDays } = usePrefs()
  const enabled = prefs.autoDeleteArchivedDays !== null

  const [draftDays, setDraftDays] = useState<number>(prefs.autoDeleteArchivedDays ?? DEFAULT_DAYS)
  const [pendingEnable, setPendingEnable] = useState(false)
  const [pendingPurge, setPendingPurge] = useState(false)
  const [purging, setPurging] = useState(false)
  const [lastPurged, setLastPurged] = useState<number | null>(null)

  const displayedDays = enabled ? (prefs.autoDeleteArchivedDays ?? DEFAULT_DAYS) : draftDays

  const handleToggle = (next: boolean) => {
    if (next) {
      setPendingEnable(true)
    } else {
      setDraftDays(prefs.autoDeleteArchivedDays ?? draftDays)
      setAutoDeleteArchivedDays(null)
    }
  }

  const handleDaysChange = (raw: string) => {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed)) return
    const clamped = clampDays(parsed)
    setDraftDays(clamped)
    if (enabled) setAutoDeleteArchivedDays(clamped)
  }

  const handleConfirmEnable = () => {
    setAutoDeleteArchivedDays(clampDays(draftDays))
  }

  const handleConfirmPurge = async () => {
    setPurging(true)
    try {
      const res = await fetch('/api/prefs/archive-purge/run', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { purged: string[] }
      setLastPurged(data.purged.length)
    } catch {
      setLastPurged(null)
    } finally {
      setPurging(false)
    }
  }

  return (
    <Section
      title={t('settings.sessions.retention.title')}
      description={t('settings.sessions.retention.description')}
    >
      <ToggleField
        label={t('settings.sessions.retention.enable')}
        hint={t('settings.sessions.retention.enableHint')}
        checked={enabled}
        onChange={handleToggle}
      />
      <Field
        label={t('settings.sessions.retention.daysLabel')}
        hint={t('settings.sessions.retention.daysHint', {
          min: ARCHIVE_RETENTION_MIN_DAYS,
          max: ARCHIVE_RETENTION_MAX_DAYS,
        })}
      >
        <input
          type="number"
          min={ARCHIVE_RETENTION_MIN_DAYS}
          max={ARCHIVE_RETENTION_MAX_DAYS}
          step={1}
          value={displayedDays}
          disabled={!enabled}
          onChange={(e) => handleDaysChange(e.target.value)}
          className="max-w-[8rem] rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      </Field>
      {enabled ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="xs"
            variant="warn"
            onClick={() => setPendingPurge(true)}
            disabled={purging}
          >
            {purging
              ? t('settings.sessions.retention.purging')
              : t('settings.sessions.retention.purgeNow')}
          </Button>
          {lastPurged !== null ? (
            <span className="text-[11px] text-muted-foreground">
              {t('settings.sessions.retention.lastPurged', { count: lastPurged })}
            </span>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        open={pendingEnable}
        title={t('settings.sessions.retention.confirm.title')}
        description={t('settings.sessions.retention.confirm.body', { days: draftDays })}
        destructive
        confirmLabel={t('settings.sessions.retention.confirm.confirm')}
        onConfirm={handleConfirmEnable}
        onClose={() => setPendingEnable(false)}
      />
      <ConfirmDialog
        open={pendingPurge}
        title={t('settings.sessions.retention.purgeConfirm.title')}
        description={t('settings.sessions.retention.purgeConfirm.body', { days: displayedDays })}
        destructive
        confirmLabel={t('settings.sessions.retention.purgeConfirm.confirm')}
        onConfirm={handleConfirmPurge}
        onClose={() => setPendingPurge(false)}
      />
    </Section>
  )
}
