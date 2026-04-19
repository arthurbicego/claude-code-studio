import type { ApiError } from '@shared/types'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

export function isApiError(value: unknown): value is ApiError {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).message === 'string'
  )
}

/** Translate an ApiError (or fallback string) using i18n. */
export function translateApiError(t: TFunction, body: unknown): string {
  if (isApiError(body)) {
    const key = `errors.${body.code}`
    const translated = t(key, { ...(body.params ?? {}), defaultValue: body.message })
    return translated
  }
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    typeof (body as { error?: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error
  }
  if (typeof body === 'string') return body
  return t('errors.UNKNOWN', { defaultValue: 'Unknown error' })
}

/**
 * Read the response body as ApiError shape. If the body cannot be parsed or
 * does not match the contract, returns a synthetic { code: 'UNKNOWN', ... }.
 * Caller can pass the result to translateApiError or t('errors.<code>', params)
 * directly.
 */
export async function readApiError(res: Response): Promise<ApiError> {
  try {
    const body = await res.json()
    if (isApiError(body)) return body
    if (
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof (body as { error?: unknown }).error === 'string'
    ) {
      return { code: 'UNKNOWN', message: (body as { error: string }).error }
    }
  } catch {
    /* not JSON */
  }
  return { code: 'UNKNOWN', message: `HTTP ${res.status}` }
}

/**
 * Hook returning a function that translates an ApiError (or fallback) using
 * the active i18n locale. Use in components/hooks that have access to React
 * context.
 */
export function useApiErrorTranslator(): (body: unknown) => string {
  const { t } = useTranslation()
  return (body: unknown) => translateApiError(t, body)
}

/**
 * Throw an Error whose .message is the raw English fallback from the server,
 * carrying the parsed ApiError as a `apiError` property so that catchers can
 * choose to translate it via translateApiError(t, err.apiError).
 */
export class ApiErrorException extends Error {
  apiError: ApiError
  constructor(apiError: ApiError) {
    super(apiError.message)
    this.name = 'ApiErrorException'
    this.apiError = apiError
  }
}

export function getApiErrorFrom(value: unknown): ApiError | null {
  if (value instanceof ApiErrorException) return value.apiError
  if (
    value &&
    typeof value === 'object' &&
    'apiError' in value &&
    isApiError((value as { apiError?: unknown }).apiError)
  ) {
    return (value as { apiError: ApiError }).apiError
  }
  return null
}
