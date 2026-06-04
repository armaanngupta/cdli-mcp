import { ErrorCode, McpError } from '../util/errors.js';

const BASE_URL = 'https://cdli.earth';
const DEFAULT_TIMEOUT_MS = 10000;

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

// 404 (no inscription / uninscribed / nonexistent) and 406 (exists but not annotated) are
// expected outcomes for inscription format routes, not errors — surfaced for the caller to phrase.
export type TextResult = { ok: true; text: string } | { ok: false; status: 404 | 406 };

export async function cdliFetchText(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<TextResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) return { ok: true, text: await res.text() };
    if (res.status === 404 || res.status === 406) return { ok: false, status: res.status };
    throw new McpError(
      ErrorCode.UPSTREAM_ERROR,
      `CDLI returned ${res.status} for ${url}`,
      res.status >= 500,
    );
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

// Canonical human-facing artifact page (confirmed 200, no redirect). Distinct from
// the /artifacts/{id}.json data endpoint — this is the URL a card links out to.
export function cdliArtifactUrl(id: string | number): string {
  return `${BASE_URL}/artifacts/${normalizeArtifactId(String(id))}`;
}

// Normalizes P000001, P12345, 12345 → bare integer string (e.g. "1", "12345")
export function normalizeArtifactId(input: string): string {
  return String(parseInt(input.replace(/^P0*/i, ''), 10));
}
