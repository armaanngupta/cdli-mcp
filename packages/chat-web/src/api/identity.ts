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

/**
 * The display name inside a token, for the sidebar only.
 *
 * Read without verifying the signature — deliberately. Nothing here grants access; the
 * backend verifies the same token by HMAC before spending anything, so a forged name would
 * only mislabel the user's own screen.
 */
export function displayName(token: string | null): string | null {
  if (!token) return null;
  try {
    // atob yields one char per byte, so a name outside ASCII ("Élise") arrives mojibaked
    // unless the bytes are decoded as UTF-8 explicitly.
    const binary = atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const claims = payload as Record<string, unknown>;
    // `name` is the claim to add framework-side; the others are fallbacks so a signed-in
    // user is never shown as anonymous just because the claim set differs.
    for (const key of ['name', 'preferred_username', 'username', 'email', 'sub']) {
      const value = claims[key];
      if (typeof value === 'string' && value !== '') return value;
    }
    return null;
  } catch {
    return null;
  }
}
