import type { LanguageModel } from 'ai';
import type { Identity } from '../auth/verify.js';
import { tryConsumeFundedBudget } from '../ratelimit/budget.js';
import { ChatError, ErrorCode } from '../util/errors.js';
import { resolveModel } from './provider.js';
import type { Provider } from './provider.js';

// Funded key is pinned to one cheap/free-tier provider+model (plan §9.2) — logged-in users
// don't get to pick provider/model on the funded path, only when they bring their own key.
const FUNDED_PROVIDER: Provider = 'mistral';
const FUNDED_MODEL = 'mistral-small-latest';

export interface ResolvedCredentials {
  model: LanguageModel;
  usingFunded: boolean;
}

// The single chokepoint (plan §9.2) deciding BYOM vs CDLI-funded key + model per request.
export function resolveCredentials(
  identity: Identity | null,
  provider: Provider,
  byomKey: string | undefined,
  model: string | undefined,
): ResolvedCredentials {
  if (byomKey) {
    return { model: resolveModel(provider, byomKey, model), usingFunded: false };
  }
  if (!identity) {
    throw new ChatError(ErrorCode.UNAUTHORIZED, 401, 'Sign in or provide your own API key.');
  }

  const fundedKey = process.env.FUNDED_MISTRAL_API_KEY;
  if (!fundedKey) {
    throw new ChatError(ErrorCode.UPSTREAM_ERROR, 500, 'Funded key not configured.');
  }
  if (!tryConsumeFundedBudget()) {
    throw new ChatError(
      ErrorCode.BUDGET_EXHAUSTED,
      429,
      'Free tier exhausted for today — add your own key.',
    );
  }
  return { model: resolveModel(FUNDED_PROVIDER, fundedKey, FUNDED_MODEL), usingFunded: true };
}
