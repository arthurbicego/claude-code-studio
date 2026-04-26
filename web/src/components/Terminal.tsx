import { FitAddon } from '@xterm/addon-fit'
import { Terminal as Xterm } from '@xterm/xterm'
import { type ClipboardEvent, type DragEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getBootTokenOrThrow, loadBootToken } from '@/lib/bootToken'
import { cn } from '@/lib/utils'
import type { Attachment, SessionLaunch } from '@/types'
import { AttachmentChipRow, type UIAttachment } from './AttachmentChip'
import { AttachmentPreviewModal } from './AttachmentPreview'

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

const ACCEPTED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
])

const EXTENSION_MIME: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function inferMime(file: File): string {
  if (file.type && ACCEPTED_MIMES.has(file.type)) return file.type
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && EXTENSION_MIME[ext]) return EXTENSION_MIME[ext]
  return file.type
}

function kindFor(mime: string): UIAttachment['kind'] {
  if (mime.startsWith('image/')) return 'image'
  if (mime === 'application/pdf') return 'pdf'
  return 'text'
}

function buildWsUrl(launch: SessionLaunch, token: string, skip?: Props['skipDefaults']) {
  const params = new URLSearchParams()
  params.set('sessionKey', launch.sessionKey)
  params.set('cwd', launch.cwd)
  params.set('token', token)
  if (launch.resume) {
    params.set('resume', launch.resume)
  } else {
    if (launch.model && launch.model !== skip?.model) params.set('model', launch.model)
    if (launch.effort && launch.effort !== skip?.effort) params.set('effort', launch.effort)
    if (launch.permissionMode && launch.permissionMode !== (skip?.permissionMode ?? 'default')) {
      params.set('permissionMode', launch.permissionMode)
    }
    if (launch.worktree) params.set('worktree', launch.worktree)
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
  const { t } = useTranslation()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Xterm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  // The PTY effect only re-runs when `launch` changes (intentional — we don't want to tear
  // down the WebSocket on every parent rerender). But onStatus/onExit/t can change between
  // renders (e.g. parent flips them when this session is no longer active, or locale flips),
  // and the WS handlers must read the current callbacks rather than the ones captured when
  // the WS opened. Forwarding them through refs keeps the effect stable while still letting
  // the latest values reach the handlers.
  const onStatusRef = useRef(onStatus)
  const onExitRef = useRef(onExit)
  const tRef = useRef(t)
  onStatusRef.current = onStatus
  onExitRef.current = onExit
  tRef.current = t

  const [attachments, setAttachments] = useState<UIAttachment[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [previewTempId, setPreviewTempId] = useState<string | null>(null)
  const uploadsRef = useRef(new Map<string, AbortController>())
  const pendingInjectRef = useRef<string[]>([])
  const dragCounterRef = useRef(0)
  const sessionKeyRef = useRef<string | null>(null)
  sessionKeyRef.current = launch?.sessionKey ?? null

  // biome-ignore lint/correctness/useExhaustiveDependencies: reconnect the WS only when the session changes; adding callbacks/translations as deps would tear down and rebuild the PTY socket on every parent rerender
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

    // Re-fit on the next frame: the sync fit above runs before xterm has
    // measured the monospace cell, so it often silently keeps the terminal at
    // the default 80x24. By the next animation frame the renderer has done its
    // first pass and fit() produces the real container dimensions.
    const initialFitRaf = requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch {
        /* noop */
      }
    })

    // The boot token is normally cached by main.tsx before render. Falling back to a fetch
    // here keeps the terminal usable if that initial load failed (e.g. network blip).
    let token: string
    try {
      token = getBootTokenOrThrow()
    } catch {
      onStatusRef.current?.(tRef.current('terminal.error', { message: 'auth token not loaded — retrying' }))
      void loadBootToken().catch(() => {
        /* surface in onStatus below */
      })
      return () => {
        cancelAnimationFrame(initialFitRaf)
        try {
          term.dispose()
        } catch {
          /* noop */
        }
        termRef.current = null
        fitRef.current = null
      }
    }
    const url = buildWsUrl(launch, token, skipDefaults)
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
      onStatusRef.current?.(
        launch.resume
          ? (launch.label ?? launch.resume)
          : tRef.current('terminal.newSessionAt', { cwd: launch.cwd }),
      )
      safeSend({ type: 'resize', cols: term.cols, rows: term.rows })
      safeSend({ type: 'focus', active: isActiveRef.current })
      if (pendingInjectRef.current.length > 0) {
        for (const data of pendingInjectRef.current) safeSend({ type: 'input', data })
        pendingInjectRef.current = []
      }
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as
          | { type: 'data'; data: string }
          | { type: 'exit'; exitCode: number }
          | { type: 'error'; message: string }
        if (msg.type === 'data') term.write(msg.data)
        else if (msg.type === 'exit') {
          onExitRef.current?.(msg.exitCode)
          onStatusRef.current?.(tRef.current('terminal.processExited', { code: msg.exitCode }))
        } else if (msg.type === 'error') {
          onStatusRef.current?.(tRef.current('terminal.error', { message: msg.message }))
        }
      } catch {
        /* noop */
      }
    }
    ws.onclose = () => onStatusRef.current?.(tRef.current('terminal.connectionClosed'))
    ws.onerror = () => onStatusRef.current?.(tRef.current('terminal.wsError'))

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

    // When the browser tab is backgrounded, xterm's renderer suspends and
    // ResizeObserver stops firing for the hidden element. Refit on the next
    // frame after the tab becomes visible so any size change that happened
    // while hidden — or a stale renderer measurement — gets corrected.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      if (!isActiveRef.current) return
      requestAnimationFrame(() => {
        try {
          fit.fit()
        } catch {
          /* noop */
        }
      })
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelAnimationFrame(initialFitRaf)
      document.removeEventListener('visibilitychange', onVisibilityChange)
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
      pendingInjectRef.current = []
      for (const ctrl of uploadsRef.current.values()) ctrl.abort()
      uploadsRef.current.clear()
      setAttachments((prev) => {
        for (const item of prev) {
          if (item.objectUrl) URL.revokeObjectURL(item.objectUrl)
        }
        return []
      })
    }
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

  const injectPath = (absPath: string) => {
    const data = `@${absPath} `
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'input', data }))
        return
      } catch {
        /* noop */
      }
    }
    pendingInjectRef.current.push(data)
  }

  const uploadFile = (file: File) => {
    const sessionKey = sessionKeyRef.current
    if (!sessionKey) return
    const mime = inferMime(file)
    const kind = kindFor(mime)
    const tempId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const objectUrl = URL.createObjectURL(file)
    const pending: UIAttachment = {
      tempId,
      name: file.name || 'attachment',
      size: file.size,
      mime,
      kind,
      state: 'uploading',
      objectUrl,
    }
    setAttachments((prev) => [...prev, pending])

    const controller = new AbortController()
    uploadsRef.current.set(tempId, controller)

    const form = new FormData()
    form.append('file', file)

    fetch(`/api/sessions/${encodeURIComponent(sessionKey)}/attachments`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          let message = `HTTP ${res.status}`
          try {
            const body = (await res.json()) as { code?: string; message?: string }
            if (body.code === 'ATTACHMENT_TYPE_UNSUPPORTED')
              message = t('attachments.unsupportedType')
            else if (body.code === 'ATTACHMENT_TOO_LARGE')
              message = t('attachments.tooLarge', { max: '25 MB' })
            else if (body.code === 'ATTACHMENT_LIMIT_REACHED')
              message = t('attachments.limitReached', { max: 20 })
            else if (body.message) message = body.message
          } catch {
            /* noop */
          }
          throw new Error(message)
        }
        return (await res.json()) as Attachment
      })
      .then((attachment) => {
        uploadsRef.current.delete(tempId)
        setAttachments((prev) =>
          prev.map((item) =>
            item.tempId === tempId ? { ...item, state: 'ready', attachment } : item,
          ),
        )
        injectPath(attachment.path)
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return
        uploadsRef.current.delete(tempId)
        setAttachments((prev) =>
          prev.map((item) =>
            item.tempId === tempId ? { ...item, state: 'failed', error: err.message } : item,
          ),
        )
      })
  }

  const handleFiles = (files: FileList | File[]) => {
    for (const file of Array.from(files)) uploadFile(file)
  }

  const removeAttachment = (tempId: string) => {
    const existing = uploadsRef.current.get(tempId)
    if (existing) {
      existing.abort()
      uploadsRef.current.delete(tempId)
    }
    setAttachments((prev) => {
      const item = prev.find((a) => a.tempId === tempId)
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl)
      if (item?.attachment && sessionKeyRef.current) {
        fetch(
          `/api/sessions/${encodeURIComponent(sessionKeyRef.current)}/attachments/${item.attachment.id}`,
          { method: 'DELETE' },
        ).catch(() => {
          /* best-effort */
        })
      }
      return prev.filter((a) => a.tempId !== tempId)
    })
  }

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    handleFiles(files)
  }

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    dragCounterRef.current += 1
    setDragActive(true)
  }

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) setDragActive(false)
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return
    e.preventDefault()
    dragCounterRef.current = 0
    setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: paste/drag handlers run on the container so the inner xterm instance (which manages its own a11y and focus) continues to receive keyboard input; the host is not otherwise interactive
    <div
      className={cn('absolute inset-0 flex flex-col bg-[#1e1e1e] p-2', !isActive && 'hidden')}
      onPasteCapture={onPaste}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div ref={hostRef} className="min-h-0 flex-1" />
      {attachments.length > 0 ? (
        <AttachmentChipRow
          items={attachments}
          onRemove={removeAttachment}
          onPreview={setPreviewTempId}
          className="mt-2 max-h-24 overflow-y-auto pr-1"
        />
      ) : null}
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-sky-500/10 ring-2 ring-sky-400/60">
          <span className="rounded bg-sky-500/80 px-3 py-1.5 text-xs font-medium text-white shadow">
            {t('attachments.dropHere')}
          </span>
        </div>
      ) : null}
      <AttachmentPreviewModal
        item={attachments.find((a) => a.tempId === previewTempId) ?? null}
        onClose={() => setPreviewTempId(null)}
      />
    </div>
  )
}
