import type {
  MaintenanceCategoryKey,
  MaintenanceCleanupResult,
  MaintenanceScanResult,
} from '@shared/types'
import { useCallback, useEffect, useState } from 'react'

type State = {
  result: MaintenanceScanResult | null
  loading: boolean
  error: string | null
}

export function useMaintenance() {
  const [state, setState] = useState<State>({ result: null, loading: true, error: null })
  const [cleaning, setCleaning] = useState<MaintenanceCategoryKey | null>(null)

  const scan = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch('/api/maintenance/scan', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as MaintenanceScanResult
      setState({ result: data, loading: false, error: null })
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }, [])

  useEffect(() => {
    scan()
  }, [scan])

  const cleanup = useCallback(
    async (
      category: MaintenanceCategoryKey,
      itemIds: string[],
    ): Promise<MaintenanceCleanupResult> => {
      setCleaning(category)
      try {
        const res = await fetch('/api/maintenance/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, itemIds, confirm: true }),
        })
        if (!res.ok) {
          const detail = await res.text()
          throw new Error(detail || `HTTP ${res.status}`)
        }
        const data = (await res.json()) as MaintenanceCleanupResult
        await scan()
        return data
      } finally {
        setCleaning(null)
      }
    },
    [scan],
  )

  return { ...state, cleaning, scan, cleanup }
}
