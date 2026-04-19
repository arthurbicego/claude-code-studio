import { useEffect, useRef } from 'react'
import { Terminal as Xterm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { PanelContainer } from './PanelContainer'

type Props = {
  cwd: string | null
  onClose: () => void
}

export function ShellPanel({ cwd, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)

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

    const params = new URLSearchParams()
    if (cwd) params.set('cwd', cwd)
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/pty/shell?${params.toString()}`)

    const safeSend = (obj: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(obj)) } catch { /* noop */ }
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
        else if (msg.type === 'error') term.write(`\r\n[erro] ${msg.message}\r\n`)
        else if (msg.type === 'exit') term.write(`\r\n[shell saiu com ${msg.exitCode}]\r\n`)
      } catch { /* noop */ }
    }

    const dataDisp = term.onData((d) => safeSend({ type: 'input', data: d }))
    const resizeDisp = term.onResize(({ cols, rows }) => safeSend({ type: 'resize', cols, rows }))

    const onResize = () => { try { fit.fit() } catch { /* noop */ } }
    const ro = new ResizeObserver(onResize)
    ro.observe(hostRef.current)
    window.addEventListener('resize', onResize)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      dataDisp.dispose()
      resizeDisp.dispose()
      try { ws.close() } catch { /* noop */ }
      try { term.dispose() } catch { /* noop */ }
    }
  }, [cwd])

  return (
    <PanelContainer title="Terminal" onClose={onClose}>
      <div className="h-full w-full bg-background p-2">
        <div ref={hostRef} className="h-full w-full" />
      </div>
    </PanelContainer>
  )
}
