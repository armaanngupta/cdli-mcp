import type { Response } from 'express';

export const ErrorCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

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
}

export function sendError(res: Response, err: unknown): void {
  const chatErr =
    err instanceof ChatError
      ? err
      : new ChatError(ErrorCode.UPSTREAM_ERROR, 502, String(err), false);

  res.status(chatErr.status).json({
    error: { code: chatErr.code, message: chatErr.message, retryable: chatErr.retryable },
  });
}
