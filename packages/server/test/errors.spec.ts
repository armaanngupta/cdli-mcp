import { describe, it, expect } from 'vitest';
import { ErrorCode, McpError, toErrorResponse } from '../src/util/errors.js';

describe('McpError', () => {
  it('toBody exposes code, message, and retryable', () => {
    const e = new McpError(ErrorCode.TIMEOUT, 'slow', true);
    expect(e.toBody()).toEqual({ code: 'TIMEOUT', message: 'slow', retryable: true });
  });

  it('defaults retryable to false', () => {
    expect(new McpError(ErrorCode.INVALID_INPUT, 'bad').retryable).toBe(false);
  });
});

describe('toErrorResponse', () => {
  it('wraps an McpError as an isError tool response', () => {
    const res = toErrorResponse(new McpError(ErrorCode.NOT_FOUND, 'gone', false));
    expect(res.isError).toBe(true);
    expect(JSON.parse(res.content[0].text)).toEqual({
      code: 'NOT_FOUND',
      message: 'gone',
      retryable: false,
    });
  });

  it('wraps a non-McpError as a non-retryable UPSTREAM_ERROR', () => {
    const body = JSON.parse(toErrorResponse(new Error('boom')).content[0].text);
    expect(body.code).toBe('UPSTREAM_ERROR');
    expect(body.retryable).toBe(false);
  });
});
