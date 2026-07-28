import type { Identity } from '../auth/verify.js';

declare global {
  namespace Express {
    interface Request {
      identity?: Identity | null;
    }
  }
}

export {};
