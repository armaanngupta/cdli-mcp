import jwt from 'jsonwebtoken';

export interface Identity {
  userId: string;
  tier: string;
}

// Shared with the CakePHP-minted token (framework's GET /chat/token, not yet built).
// Any verification failure — missing secret, missing/malformed header, bad signature,
// expired token — resolves to anon rather than throwing; identity is opportunistic.
export function verifyIdentity(authHeader: string | undefined): Identity | null {
  const secret = process.env.CHAT_IDENTITY_SECRET;
  if (!secret || !authHeader?.startsWith('Bearer ')) return null;

  try {
    const payload = jwt.verify(authHeader.slice(7), secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub) return null;
    return {
      userId: String(payload.sub),
      tier: typeof payload.tier === 'string' ? payload.tier : 'user',
    };
  } catch {
    return null;
  }
}
