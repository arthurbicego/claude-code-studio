import i18n from '@/i18n'
import { toast } from '@/lib/toast'

export async function openInVSCode(path: string): Promise<void> {
  try {
    const res = await fetch('/api/open/vscode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      const msg = body.error || `HTTP ${res.status}`
      toast.error(i18n.t('vscode.openError', { message: msg }))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.error(i18n.t('vscode.openError', { message: msg }))
  }
}
