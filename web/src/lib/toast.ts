export type ToastKind = 'info' | 'error' | 'success'

export type Toast = {
  id: string
  kind: ToastKind
  message: string
  createdAt: number
}

type Listener = (toasts: Toast[]) => void

const listeners = new Set<Listener>()
let state: Toast[] = []

function emit() {
  for (const l of listeners) l(state)
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function push(kind: ToastKind, message: string, durationMs = 5000): string {
  const id = newId()
  state = [...state, { id, kind, message, createdAt: Date.now() }]
  emit()
  if (durationMs > 0) {
    window.setTimeout(() => dismiss(id), durationMs)
  }
  return id
}

export function dismiss(id: string): void {
  const next = state.filter((t) => t.id !== id)
  if (next.length === state.length) return
  state = next
  emit()
}

export const toast = {
  info: (message: string, durationMs?: number) => push('info', message, durationMs),
  error: (message: string, durationMs?: number) => push('error', message, durationMs ?? 8000),
  success: (message: string, durationMs?: number) => push('success', message, durationMs),
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(state)
  return () => {
    listeners.delete(listener)
  }
}
