import { Button } from '@/components/ui/Button'
import { usePrefs } from '@/hooks/usePrefs'
import { Section } from './atoms'

const SIDEBAR_SECTION_LABELS: Record<string, string> = {
  open: 'Abertas',
  history: 'Histórico',
  archived: 'Arquivadas',
}
const SIDEBAR_SECTION_ORDER = ['open', 'history', 'archived'] as const

export function SidebarPrefsTab() {
  const { prefs, loaded, removeSection, setExpanded, setProjectOrder } = usePrefs()

  if (!loaded) {
    return (
      <Section title="Preferências da sidebar">
        <p className="text-xs text-muted-foreground">Carregando…</p>
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
        title="Preferências por seção"
        description="Valores lidos por cada seção da sidebar (agrupamento e ordenação). Editáveis direto pelos botões de cada seção; aqui você só inspeciona e reseta."
      >
        <div className="flex flex-col gap-2">
          {allKeys.map((key) => {
            const stored = prefs.sections[key]
            const effective = stored ?? {
              groupByProject: true,
              sortBy: 'lastResponse' as const,
            }
            const label = SIDEBAR_SECTION_LABELS[key] ?? key
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
                      Voltar ao padrão
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Padrão</span>
                  )}
                </div>
                <ul className="flex flex-col gap-0.5 font-mono text-[10px] text-muted-foreground">
                  <li>
                    sortBy:{' '}
                    {effective.sortBy === 'lastResponse' ? 'Última resposta' : 'Data de criação'}
                  </li>
                  <li>groupByProject: {effective.groupByProject ? 'sim' : 'não'}</li>
                </ul>
              </div>
            )
          })}
        </div>
      </Section>

      <Section
        title="Grupos expandidos"
        description="Projetos cujos grupos ficam abertos/fechados entre sessões. Cada chave tem o formato <seção>:<slug>."
      >
        {prefs.expanded.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum item.</p>
        ) : (
          <>
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-auto rounded border border-border bg-black/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              {prefs.expanded.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
            <div>
              <Button type="button" size="xs" variant="ghost" onClick={() => setExpanded(() => [])}>
                Limpar ({prefs.expanded.length})
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section
        title="Ordem customizada de projetos"
        description="Ordem definida por arrastar e soltar na sidebar. Sem entradas aqui, a ordem é automática (última atividade)."
      >
        {prefs.projectOrder.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum — ordem automática.</p>
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
                Resetar ordem ({prefs.projectOrder.length})
              </Button>
            </div>
          </>
        )}
      </Section>
    </>
  )
}
