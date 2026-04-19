import { useEffect, useState } from 'react'

type UsePollingOptions = {
  intervalMs: number
  enabled: boolean
  /** When enabled becomes false, keep the last value instead of resetting to null. */
  keepDataOnDisabled?: boolean
}

export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  { intervalMs, enabled, keepDataOnDisabled = false }: UsePollingOptions,
): T | null {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (!keepDataOnDisabled) setData(null)
      return
    }

    const controller = new AbortController()
    let cancelled = false
    let timer: number | null = null

    const tick = async () => {
      try {
        const payload = await fetcher(controller.signal)
        if (!cancelled) setData(payload)
      } catch {
        // swallow — keep previous value visible on transient failures
      } finally {
        if (!cancelled) {
          timer = window.setTimeout(tick, intervalMs)
        }
      }
    }

    tick()

    return () => {
      cancelled = true
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [fetcher, intervalMs, enabled, keepDataOnDisabled])

  return data
}
