import { ErrorCode, McpError } from '../util/errors.js';

const BASE_URL = 'https://cdli.earth';
const DEFAULT_TIMEOUT_MS = 8000;

export async function cdliFetch<T>(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new McpError(
        ErrorCode.UPSTREAM_ERROR,
        `CDLI returned ${res.status} for ${url}`,
        res.status >= 500,
      );
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof McpError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new McpError(ErrorCode.TIMEOUT, `Request timed out after ${timeoutMs}ms`, true);
    }
    throw new McpError(ErrorCode.UPSTREAM_ERROR, String(err), false);
  } finally {
    clearTimeout(timer);
  }
}

export function cdliUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

// Normalizes P000001, P12345, 12345 → bare integer string (e.g. "1", "12345")
export function normalizeArtifactId(input: string): string {
  return String(parseInt(input.replace(/^P0*/i, ''), 10));
}
