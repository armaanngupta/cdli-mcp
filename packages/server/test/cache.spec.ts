import { describe, it, expect } from 'vitest';
import { cached } from '../src/util/cache.js';

describe('cached', () => {
  it('collapses concurrent calls for the same key (singleflight)', async () => {
    let calls = 0;
    const producer = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { n: 1 };
    };
    const results = await Promise.all(Array.from({ length: 5 }, () => cached('sf', producer)));
    expect(calls).toBe(1);
    expect(results.every((r) => r === results[0])).toBe(true);
  });

  it('serves a completed value from cache within TTL', async () => {
    let calls = 0;
    const a = await cached('hit', async () => {
      calls++;
      return { v: calls };
    });
    const b = await cached('hit', async () => {
      throw new Error('producer should not run on a cache hit');
    });
    expect(calls).toBe(1);
    expect(b).toBe(a);
  });

  it('uses independent entries per key', async () => {
    expect(await cached('k-a', async () => 'A')).toBe('A');
    expect(await cached('k-b', async () => 'B')).toBe('B');
  });

  it('does not cache failures (retries on the next call)', async () => {
    let calls = 0;
    const boom = async () => {
      calls++;
      throw new Error('fail');
    };
    await expect(cached('err', boom)).rejects.toThrow('fail');
    await expect(cached('err', boom)).rejects.toThrow('fail');
    expect(calls).toBe(2);
  });

  it('shares one in-flight request among concurrent failing callers', async () => {
    let calls = 0;
    const boom = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('x');
    };
    const settled = await Promise.allSettled(Array.from({ length: 4 }, () => cached('err2', boom)));
    expect(calls).toBe(1);
    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
  });
});
