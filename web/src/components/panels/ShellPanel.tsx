import { FitAddon } from '@xterm/addon-fit'
import { Terminal as Xterm } from '@xterm/xterm'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBootTokenOrThrow, loadBootToken } from '@/lib/bootToken'
import { PanelContainer } from './PanelContainer'

type Props = {
  cwd: string | null
  onClose: () => void
}

export function ShellPanel({ cwd, onClose }: Props) {
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Bumping retryToken re-runs the effect, which re-creates the WS. Used to recover after a
  // boot-token fetch that originally failed eventually succeeds.
  const [retryToken, setRetryToken] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnect the shell WS only when cwd / retryToken changes; adding translations/onClose would tear down the shell on every parent rerender
  useEffect(() => {
    if (!hostRef.current) return

    const term = new Xterm({
      theme: { background: '#0a0a0a' },
      fontFamily: 'SF Mono, Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()

    let token: string
    try {
      token = getBootTokenOrThrow()
    } catch {
      term.write(`\r\n${t('panels.shell.errorPrefix', { message: 'auth token not loaded — retrying' })}\r\n`)
      let cancelled = false
      void loadBootToken()
        .then(() => {
          if (!cancelled) setRetryToken((n) => n + 1)
        })
        .catch(() => {
          /* token unreachable; user can close and retry */
        })
      return () => {
        cancelled = true
        try {
          term.dispose()
        } catch {
          /* noop */
        }
      }
    }
    const params = new URLSearchParams()
    if (cwd) params.set('cwd', cwd)
    params.set('token', token)
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/pty/shell?${params.toString()}`)

    const safeSend = (obj: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(obj))
        } catch {
          /* noop */
        }
      }
    }

    ws.onopen = () => safeSend({ type: 'resize', cols: term.cols, rows: term.rows })
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as
          | { type: 'data'; data: string }
          | { type: 'exit'; exitCode: number }
          | { type: 'error'; message: string }
        if (msg.type === 'data') term.write(msg.data)
        else if (msg.type === 'error')
          term.write(`\r\n${t('panels.shell.errorPrefix', { message: msg.message })}\r\n`)
        else if (msg.type === 'exit')
          term.write(`\r\n${t('panels.shell.exited', { code: msg.exitCode })}\r\n`)
      } catch {
        /* noop */
      }
    }
    // Surface connection failures (server gone, auth rejected, network blip) so the panel
    // does not look frozen. Without these the WS could close silently and the user would
    // see a blank terminal that no longer responds to input.
    ws.onerror = () => {
      term.write(`\r\n${t('panels.shell.errorPrefix', { message: 'connection error' })}\r\n`)
    }
    ws.onclose = () => {
      term.write(`\r\n${t('panels.shell.errorPrefix', { message: 'connection closed' })}\r\n`)
    }

    const dataDisp = term.onData((d) => safeSend({ type: 'input', data: d }))
    const resizeDisp = term.onResize(({ cols, rows }) => safeSend({ type: 'resize', cols, rows }))

    const onResize = () => {
      try {
        fit.fit()
      } catch {
        /* noop */
      }
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(hostRef.current)
    window.addEventListener('resize', onResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      dataDisp.dispose()
      resizeDisp.dispose()
      try {
        ws.close()
      } catch {
        /* noop */
      }
      try {
        term.dispose()
      } catch {
        /* noop */
      }
    }
  }, [cwd, retryToken])

  return (
    <PanelContainer title={t('panels.shell.title')} onClose={onClose}>
      <div className="h-full w-full bg-background p-2">
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </PanelContainer>
  )
}
