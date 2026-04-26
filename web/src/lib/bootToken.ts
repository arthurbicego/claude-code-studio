// In-memory cache for the per-install boot token returned by /api/auth/boot-token.
// The token gates WebSocket upgrades on /pty endpoints. We fetch it once on app boot from the
// same origin so cross-origin pages cannot read it under SOP, then read the cached value
// synchronously when opening WS connections.

let token: string | null = null
let pending: Promise<string> | null = null

export async function loadBootToken(): Promise<string> {
  if (token) return token
  if (pending) return pending
  const attempt = (async () => {
    try {
      const res = await fetch('/api/auth/boot-token', { cache: 'no-store' })
      if (!res.ok) throw new Error(`boot token fetch failed: ${res.status}`)
      const data = (await res.json()) as { token?: unknown }
      if (typeof data.token !== 'string' || !data.token) {
        throw new Error('boot token response missing token')
      }
      token = data.token
      return token
    } finally {
      // Clear the in-flight handle so a rejection does not poison every subsequent
      // loadBootToken() call. Successive callers retry the fetch from scratch instead of
      // resolving against a stale rejected promise.
      pending = null
    }
  })()
  pending = attempt
  return attempt
}

export function getBootTokenOrThrow(): string {
  if (!token) {
    throw new Error('boot token not loaded yet — loadBootToken() must run before opening WS')
  }
  return token
}
