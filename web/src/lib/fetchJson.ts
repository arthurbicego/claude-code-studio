import { ApiErrorException, readApiError } from './apiError'

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const apiErr = await readApiError(res)
    throw new ApiErrorException(apiErr)
  }
  return (await res.json()) as T
}
