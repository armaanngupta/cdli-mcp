export const ErrorCode = {
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  TIMEOUT: 'TIMEOUT',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface McpErrorBody {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export class McpError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.retryable = retryable;
  }

  toBody(): McpErrorBody {
    return { code: this.code, message: this.message, retryable: this.retryable };
  }
}

export function toErrorResponse(err: unknown) {
  const body =
    err instanceof McpError
      ? err.toBody()
      : { code: ErrorCode.UPSTREAM_ERROR, message: String(err), retryable: false };

  return {
    isError: true as const,
    content: [{ type: 'text' as const, text: JSON.stringify(body) }],
  };
}
