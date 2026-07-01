import { LRUCache } from 'lru-cache';

const MAX_ENTRIES = 500;
const TTL_MS = 30_000;

const results = new LRUCache<string, object>({ max: MAX_ENTRIES, ttl: TTL_MS });
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, producer: () => Promise<T>): Promise<T> {
  const hit = results.get(key);
  if (hit !== undefined) return hit as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = producer()
    .then((value) => {
      if (value !== undefined && value !== null) results.set(key, value as object);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
