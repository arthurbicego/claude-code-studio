import { API_ERROR_CODES, type ApiError, type ApiErrorCode } from '@shared/types';
import type { Response } from 'express';

export const ERR = API_ERROR_CODES;

export function apiError(
  code: ApiErrorCode | string,
  message: string,
  params?: Record<string, unknown>,
): ApiError {
  return params ? { code, message, params } : { code, message };
}

export function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode | string,
  message: string,
  params?: Record<string, unknown>,
): Response {
  return res.status(status).json(apiError(code, message, params));
}

/** Wrap an unexpected exception into a 500 ApiError preserving the original message. */
export function sendInternalError(res: Response, err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  return sendError(res, 500, ERR.INTERNAL, message);
}
