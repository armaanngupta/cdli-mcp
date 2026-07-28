import type { Response } from 'express';

export const ErrorCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ChatErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export class ChatError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, status: number, message: string, retryable = false) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }

  toBody(): ChatErrorBody {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}

export function errorBody(err: unknown): ChatErrorBody {
  return err instanceof ChatError
    ? err.toBody()
    : { code: ErrorCode.UPSTREAM_ERROR, message: String(err), retryable: false };
}

export function sendError(res: Response, err: unknown): void {
  const status = err instanceof ChatError ? err.status : 502;
  res.status(status).json({ error: errorBody(err) });
}
