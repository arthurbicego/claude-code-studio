import type { ProjectSortBy, SectionPrefs, SessionSortBy } from '@shared/types'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { usePrefs } from '@/hooks/usePrefs'
import { Section } from './atoms'

const SIDEBAR_SECTION_LABEL_KEYS: Record<string, string> = {
  open: 'settings.sidebarPrefs.section.open',
  history: 'settings.sidebarPrefs.section.history',
  archived: 'settings.sidebarPrefs.section.archived',
}
const SIDEBAR_SECTION_ORDER = ['open', 'history', 'archived'] as const

function sessionSortLabel(t: ReturnType<typeof useTranslation>['t'], value: SessionSortBy): string {
  return t(`settings.sidebarPrefs.sortOptions.${value}`)
}

function projectSortLabel(
  t: ReturnType<typeof useTranslation>['t'],
  value: ProjectSortBy | null,
): string {
  return t(
    value === null
      ? 'settings.sidebarPrefs.projectSortOptions.custom'
      : `settings.sidebarPrefs.projectSortOptions.${value}`,
  )
}

export function SidebarPrefsTab() {
  const { t } = useTranslation()
  const { prefs, loaded, removeSection, setExpanded, setProjectOrder, setSessionSortForProject } =
    usePrefs()

  if (!loaded) {
    return (
      <Section title={t('settings.sidebarPrefs.title')}>
        <p className="text-xs text-muted-foreground">{t('settings.sidebarPrefs.loading')}</p>
      </Section>
    )
  }

  const storedKeys = Object.keys(prefs.sections)
  const extraKeys = storedKeys.filter(
    (k) => !SIDEBAR_SECTION_ORDER.includes(k as (typeof SIDEBAR_SECTION_ORDER)[number]),
  )
  const allKeys = [...SIDEBAR_SECTION_ORDER, ...extraKeys]

  return (
    <>
      <Section
        title={t('settings.sidebarPrefs.perSection')}
        description={t('settings.sidebarPrefs.perSectionHelp')}
      >
        <div className="flex flex-col gap-2">
          {allKeys.map((key) => {
            const stored = prefs.sections[key]
            const effective: SectionPrefs = {
              groupByProject: stored?.groupByProject ?? true,
              projectSortBy: stored?.projectSortBy ?? null,
              flatSessionSort: stored?.flatSessionSort ?? 'lastResponse',
            }
            const labelKey = SIDEBAR_SECTION_LABEL_KEYS[key]
            const label = labelKey ? t(labelKey) : key
            return (
              <div
                key={key}
                className="flex flex-col gap-1.5 rounded border border-border bg-background/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground">{label}</span>
                  {stored ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => removeSection(key)}
                    >
                      {t('settings.sidebarPrefs.reset')}
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {t('settings.sidebarPrefs.default')}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-0.5 font-mono text-[10px] text-muted-foreground">
                  <li>projectSortBy: {projectSortLabel(t, effective.projectSortBy)}</li>
                  <li>flatSessionSort: {sessionSortLabel(t, effective.flatSessionSort)}</li>
                  <li>
                    groupByProject:{' '}
                    {effective.groupByProject
                      ? t('settings.sidebarPrefs.yes')
                      : t('settings.sidebarPrefs.no')}
                  </li>
                </ul>
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title={t('settings.sidebarPrefs.expandedGroups')}
        description={t('settings.sidebarPrefs.expandedGroupsHelp')}
      >
        {prefs.expanded.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('settings.sidebarPrefs.noItems')}</p>
        ) : (
          <>
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded border border-border bg-black/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              {prefs.expanded.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <div>
              <Button type="button" size="xs" variant="ghost" onClick={() => setExpanded(() => [])}>
                {t('settings.sidebarPrefs.clearN', { count: prefs.expanded.length })}
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section
        title={t('settings.sidebarPrefs.customOrder')}
        description={t('settings.sidebarPrefs.customOrderHelp')}
      >
        {prefs.projectOrder.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('settings.sidebarPrefs.noOrder')}</p>
        ) : (
          <>
            <ol className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded border border-border bg-black/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              {prefs.projectOrder.map((slug, i) => (
                <li key={slug}>
                  {i + 1}. {slug}
                </li>
              ))}
            </ol>
            <div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => setProjectOrder(() => [])}
              >
                {t('settings.sidebarPrefs.resetOrder', { count: prefs.projectOrder.length })}
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section
        title={t('settings.sidebarPrefs.projectSort')}
        description={t('settings.sidebarPrefs.projectSortHelp')}
      >
        {Object.keys(prefs.sessionSortByProject).length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t('settings.sidebarPrefs.noProjectSort')}
          </p>
        ) : (
          <>
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded border border-border bg-black/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              {Object.entries(prefs.sessionSortByProject).map(([slug, sortBy]) => (
                <li key={slug} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {slug}: {sessionSortLabel(t, sortBy)}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => setSessionSortForProject(slug, null)}
                  >
                    {t('settings.sidebarPrefs.reset')}
                  </Button>
                </li>
              ))}
            </ul>
            <div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => {
                  for (const slug of Object.keys(prefs.sessionSortByProject)) {
                    setSessionSortForProject(slug, null)
                  }
                }}
              >
                {t('settings.sidebarPrefs.resetProjectSort', {
                  count: Object.keys(prefs.sessionSortByProject).length,
                })}
              </Button>
            </div>
          </>
        )}
      </Section>
    </>
  )
}
