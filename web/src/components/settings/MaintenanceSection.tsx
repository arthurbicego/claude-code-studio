import {
  MAINTENANCE_CATEGORY_KEYS,
  type MaintenanceCategory,
  type MaintenanceCategoryKey,
  type MaintenanceCleanupResult,
  type MaintenanceItem,
} from '@shared/types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { CopyableField } from '@/components/ui/CopyableField'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { useMaintenance } from '@/hooks/useMaintenance'
import { cn } from '@/lib/utils'
import { Section } from './atoms'

const PREVIEW_LIMIT = 10

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

type Pending = {
  category: MaintenanceCategoryKey
  itemIds: string[]
}

export function MaintenanceSection() {
  const { t } = useTranslation()
  const { result, loading, error, cleaning, cleanup } = useMaintenance()
  const [expanded, setExpanded] = useState<Record<MaintenanceCategoryKey, boolean>>({
    projectsWithoutSessions: false,
    orphanProjects: false,
    staleArchived: false,
    statuslineCache: false,
    orphanAttachments: false,
  })
  const [pending, setPending] = useState<Pending | null>(null)
  const [lastResult, setLastResult] = useState<
    Partial<Record<MaintenanceCategoryKey, MaintenanceCleanupResult>>
  >({})

  const toggleExpanded = (key: MaintenanceCategoryKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleConfirm = async () => {
    if (!pending) return
    try {
      const res = await cleanup(pending.category, pending.itemIds)
      setLastResult((prev) => ({ ...prev, [pending.category]: res }))
    } catch (err) {
      setLastResult((prev) => ({
        ...prev,
        [pending.category]: {
          deleted: [],
          skipped: pending.itemIds.map((id) => ({
            id,
            reason: err instanceof Error ? err.message : String(err),
          })),
        },
      }))
    } finally {
      setPending(null)
    }
  }

  return (
    <Section
      title={t('settings.geral.maintenance.title')}
      description={t('settings.geral.maintenance.description')}
    >
      {loading || error ? (
        <span className="text-[11px] text-muted-foreground">
          {loading
            ? t('settings.geral.maintenance.loading')
            : error
              ? t('settings.geral.maintenance.error', { message: error })
              : null}
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        {MAINTENANCE_CATEGORY_KEYS.map((key) => {
          const category = result?.categories[key] ?? null
          return (
            <CategoryCard
              key={key}
              categoryKey={key}
              category={category}
              expanded={expanded[key]}
              onToggleExpanded={() => toggleExpanded(key)}
              onClean={() => {
                if (!category || category.items.length === 0) return
                setPending({
                  category: key,
                  itemIds: category.items.map((it) => it.id),
                })
              }}
              cleaning={cleaning === key}
              lastResult={lastResult[key] ?? null}
            />
          )
        })}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title={t('settings.geral.maintenance.confirm.title')}
        description={
          pending
            ? `${t('settings.geral.maintenance.confirm.body', {
                count: pending.itemIds.length,
                category: t(`settings.geral.maintenance.category.${pending.category}.title`),
              })} ${t('settings.geral.maintenance.confirm.irreversible')}`
            : ''
        }
        destructive
        confirmLabel={t('settings.geral.maintenance.confirm.confirm')}
        onConfirm={handleConfirm}
        onClose={() => setPending(null)}
      />
    </Section>
  )
}

type CardProps = {
  categoryKey: MaintenanceCategoryKey
  category: MaintenanceCategory | null
  expanded: boolean
  onToggleExpanded: () => void
  onClean: () => void
  cleaning: boolean
  lastResult: MaintenanceCleanupResult | null
}

function CategoryCard({
  categoryKey,
  category,
  expanded,
  onToggleExpanded,
  onClean,
  cleaning,
  lastResult,
}: CardProps) {
  const { t } = useTranslation()
  const count = category?.items.length ?? 0
  const totalBytes = category?.totalBytes ?? 0
  const showSize = totalBytes > 0
  return (
    <div className="flex flex-col gap-2 rounded border border-border bg-background/40 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-foreground">
            {t(`settings.geral.maintenance.category.${categoryKey}.title`)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {t(`settings.geral.maintenance.category.${categoryKey}.description`)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px]',
              count > 0 ? 'bg-amber-500/20 text-amber-200' : 'bg-muted text-muted-foreground',
            )}
          >
            {count}
            {showSize ? ` · ${formatBytes(totalBytes)}` : ''}
          </span>
          {count > 0 ? (
            <Button type="button" size="xs" variant="ghost" onClick={onToggleExpanded}>
              {expanded
                ? t('settings.geral.maintenance.hide')
                : t('settings.geral.maintenance.details')}
            </Button>
          ) : null}
          <Button
            type="button"
            size="xs"
            variant="warn"
            onClick={onClean}
            disabled={count === 0 || cleaning}
          >
            {cleaning
              ? t('settings.geral.maintenance.cleaning')
              : t('settings.geral.maintenance.clean', { count })}
          </Button>
        </div>
      </div>
      {expanded && category && category.items.length > 0 ? (
        <ul className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded bg-black/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
          {category.items.slice(0, PREVIEW_LIMIT).map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{item.path ?? item.id}</span>
              <ItemInfoPopover item={item} />
            </li>
          ))}
          {category.items.length > PREVIEW_LIMIT ? (
            <li className="italic opacity-70">
              {t('settings.geral.maintenance.more', {
                count: category.items.length - PREVIEW_LIMIT,
              })}
            </li>
          ) : null}
        </ul>
      ) : null}
      {lastResult ? (
        <p className="text-[10px] text-muted-foreground">
          {t('settings.geral.maintenance.result.deleted', { count: lastResult.deleted.length })}
          {lastResult.skipped.length > 0
            ? ` ${t('settings.geral.maintenance.result.skipped', { count: lastResult.skipped.length })}`
            : ''}
        </p>
      ) : null}
    </div>
  )
}

function ItemInfoPopover({ item }: { item: MaintenanceItem }) {
  const { t } = useTranslation()
  return (
    <InfoPopover
      ariaLabel={t('settings.geral.maintenance.item.showDetails')}
      tooltip={t('settings.geral.maintenance.item.tooltip')}
      triggerClassName="shrink-0"
    >
      <div className="flex flex-col gap-2">
        <CopyableField
          label={t('settings.geral.maintenance.item.fieldId')}
          value={item.id}
          copyAriaLabel={t('settings.geral.maintenance.item.copyId')}
        />
        {item.path ? (
          <CopyableField
            label={t('settings.geral.maintenance.item.fieldPath')}
            value={item.path}
            copyAriaLabel={t('settings.geral.maintenance.item.copyPath')}
          />
        ) : null}
        {item.cwd ? (
          <CopyableField
            label={t('settings.geral.maintenance.item.fieldCwd')}
            value={item.cwd}
            copyAriaLabel={t('settings.geral.maintenance.item.copyCwd')}
          />
        ) : null}
        {typeof item.size === 'number' ? (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {t('settings.geral.maintenance.item.fieldSize')}
            </span>
            <span className="font-mono">{formatBytes(item.size)}</span>
          </div>
        ) : null}
        {item.detail ? (
          <div className="flex flex-col gap-1">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
              {t('settings.geral.maintenance.item.fieldDetail')}
            </span>
            <span className="font-mono">{item.detail}</span>
          </div>
        ) : null}
      </div>
    </InfoPopover>
  )
}
