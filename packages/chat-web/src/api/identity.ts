// The cdli.earth session cookie is HttpOnly, so the SPA can never read who is signed in.
// CakePHP mints a short-lived bearer token instead, which the backend verifies by HMAC
// without calling back to PHP. See .claude/docs/auth-bridge-handoff.md for the contract.
const TOKEN_URL = '/chat/token';

/**
 * Ask the framework for an identity token. Resolves to null for an anonymous visitor —
 * and for every failure mode too (endpoint absent in dev, network error, malformed body),
 * because identity is opportunistic: without it the user simply falls back to BYOM.
 */
export async function fetchToken(): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_URL, { credentials: 'same-origin' });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const token = (body as { token?: unknown }).token;
    return typeof token === 'string' && token !== '' ? token : null;
  } catch {
    return null;
  }
}
