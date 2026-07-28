// Global daily cap on funded-key usage — a *seam*, not real cost accounting (plan §9.2/§9.5:
// "build the seam, not the accounting"). Counts funded-tier calls, not tokens/cost; in-memory
// until a Redis-backed counter replaces it (same tradeoff as ratelimit/limiter.ts).
const DAILY_FUNDED_CALL_CAP = 500; // placeholder — tune once real usage exists
const DAY_MS = 24 * 60 * 60 * 1000;

let count = 0;
let windowStart = Date.now();

export function tryConsumeFundedBudget(): boolean {
  if (Date.now() - windowStart >= DAY_MS) {
    count = 0;
    windowStart = Date.now();
  }
  if (count >= DAILY_FUNDED_CALL_CAP) return false;
  count += 1;
  return true;
}
