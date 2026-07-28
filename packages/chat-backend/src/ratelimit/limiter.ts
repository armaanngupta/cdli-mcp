import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';
import type { Identity } from '../auth/verify.js';

// Placeholder thresholds — plan §9.5 flags these as "tune later" once real usage exists.
// Store is express-rate-limit's default in-memory MemoryStore (no Redis in dev yet); swapping
// in a Redis-backed store later (so limits are shared across replicas) is a `store:` option on
// each limiter, not a rewrite of this module.
const WINDOW_MS = 60_000;
const ANON_BYOM_PER_MINUTE = 20;
const USER_BYOM_PER_MINUTE = 40;
const USER_FUNDED_PER_MINUTE = 5;

function keyGenerator(req: Request): string {
  const identity = req.identity;
  return identity ? `user:${identity.userId}` : `ip:${req.ip}`;
}

function makeLimiter(max: number) {
  return rateLimit({ windowMs: WINDOW_MS, max, standardHeaders: true, legacyHeaders: false, keyGenerator });
}

const anonByomLimiter = makeLimiter(ANON_BYOM_PER_MINUTE);
const userByomLimiter = makeLimiter(USER_BYOM_PER_MINUTE);
const userFundedLimiter = makeLimiter(USER_FUNDED_PER_MINUTE);

// Tier depends on the parsed body (byomKey present?) and identity, both only known once
// express.json() + verifyIdentity have run — so this dispatches to a limiter at request time
// rather than being mounted as static middleware.
export function applyRateLimit(
  identity: Identity | null,
  usingFunded: boolean,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const limiter =
    identity && usingFunded ? userFundedLimiter : identity ? userByomLimiter : anonByomLimiter;
  limiter(req, res, next);
}
