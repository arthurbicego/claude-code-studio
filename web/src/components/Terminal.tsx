import { useEffect, useRef } from 'react'
import { Terminal as Xterm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { cn } from '@/lib/utils'
import type { SessionLaunch } from '@/types'

type InputSignal = { seq: number; text: string } | null

type Props = {
  launch: SessionLaunch | null
  skipDefaults?: {
    model: string | null
    effort: string | null
    permissionMode: string
  }
  onExit?: (exitCode: number) => void
  onStatus?: (text: string) => void
  interruptSignal: number
  inputSignal: InputSignal
  isActive: boolean
}

function buildWsUrl(launch: SessionLaunch, skip?: Props['skipDefaults']) {
  const params = new URLSearchParams()
  params.set('sessionKey', launch.sessionKey)
  params.set('cwd', launch.cwd)
  if (launch.resume) {
    params.set('resume', launch.resume)
  } else {
    if (launch.model && launch.model !== skip?.model) params.set('model', launch.model)
    if (launch.effort && launch.effort !== skip?.effort) params.set('effort', launch.effort)
    if (
      launch.permissionMode &&
      launch.permissionMode !== (skip?.permissionMode ?? 'default')
    ) {
      params.set('permissionMode', launch.permissionMode)
    }
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/pty?${params.toString()}`
}

export function TerminalView({
  launch,
  skipDefaults,
  onExit,
  onStatus,
  interruptSignal,
  inputSignal,
  isActive,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Xterm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  useEffect(() => {
    if (!launch || !hostRef.current) return

    const term = new Xterm({
      theme: { background: '#1e1e1e' },
      fontFamily: 'SF Mono, Menlo, Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(hostRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    const url = buildWsUrl(launch, skipDefaults)
    const ws = new WebSocket(url)
    wsRef.current = ws

    const safeSend = (obj: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(obj))
        } catch {
          /* noop */
        }
      }
    }

    ws.onopen = () => {
      onStatus?.(launch.resume ? `Resumido ${launch.resume}` : `Nova sessão em ${launch.cwd}`)
      safeSend({ type: 'resize', cols: term.cols, rows: term.rows })
      safeSend({ type: 'focus', active: isActiveRef.current })
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as
          | { type: 'data'; data: string }
          | { type: 'exit'; exitCode: number }
          | { type: 'error'; message: string }
        if (msg.type === 'data') term.write(msg.data)
        else if (msg.type === 'exit') {
          onExit?.(msg.exitCode)
          onStatus?.(`Processo encerrou (exit ${msg.exitCode})`)
        } else if (msg.type === 'error') {
          onStatus?.(`Erro: ${msg.message}`)
        }
      } catch {
        /* noop */
      }
    }
    ws.onclose = () => onStatus?.('Conexão encerrada.')
    ws.onerror = () => onStatus?.('Erro de WebSocket.')

    const dataDisposer = term.onData((d) => safeSend({ type: 'input', data: d }))
    const resizeDisposer = term.onResize(({ cols, rows }) =>
      safeSend({ type: 'resize', cols, rows }),
    )

    const onWindowResize = () => {
      if (!isActiveRef.current) return
      try {
        fit.fit()
      } catch {
        /* noop */
      }
    }
    window.addEventListener('resize', onWindowResize)
    const ro = new ResizeObserver(onWindowResize)
    ro.observe(hostRef.current)

    return () => {
      window.removeEventListener('resize', onWindowResize)
      ro.disconnect()
      dataDisposer.dispose()
      resizeDisposer.dispose()
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
      termRef.current = null
      wsRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launch])

  useEffect(() => {
    if (interruptSignal === 0) return
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'input', data: '\x03' }))
      } catch {
        /* noop */
      }
    }
  }, [interruptSignal])

  useEffect(() => {
    if (!inputSignal) return
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'input', data: inputSignal.text }))
      } catch {
        /* noop */
      }
    }
  }, [inputSignal])

  useEffect(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'focus', active: isActive }))
      } catch {
        /* noop */
      }
    }
    if (!isActive) return
    const raf = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* noop */
      }
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [isActive])

  return (
    <div className={cn('absolute inset-0 bg-[#1e1e1e] p-2', !isActive && 'hidden')}>
      <div ref={hostRef} className="h-full w-full" />
    </div>
  )
}
