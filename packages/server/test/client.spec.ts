import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeArtifactId,
  parseLinkHeader,
  cdliUrl,
  cdliArtifactUrl,
  cdliFetch,
  cdliFetchText,
  cdliFetchWithHeaders,
} from '../src/cdliAPI/client.js';
import { ErrorCode } from '../src/util/errors.js';

type FetchImpl = (url: string, opts: { signal: AbortSignal }) => Promise<unknown>;
function mockFetch(impl: FetchImpl) {
  vi.stubGlobal('fetch', vi.fn(impl));
}
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

afterEach(() => vi.unstubAllGlobals());

describe('normalizeArtifactId', () => {
  it('strips the P prefix and leading zeros', () => {
    expect(normalizeArtifactId('P000001')).toBe('1');
    expect(normalizeArtifactId('P12345')).toBe('12345');
    expect(normalizeArtifactId('12345')).toBe('12345');
  });
});

describe('parseLinkHeader', () => {
  it('maps each rel to its url', () => {
    const h = new Headers();
    h.set(
      'link',
      '<https://cdli.earth/search.json?page=2>; rel="next", <https://cdli.earth/search.json?page=9>; rel="last"',
    );
    expect(parseLinkHeader(h)).toEqual({
      next: 'https://cdli.earth/search.json?page=2',
      last: 'https://cdli.earth/search.json?page=9',
    });
  });

  it('returns an empty map when there is no link header', () => {
    expect(parseLinkHeader(new Headers())).toEqual({});
  });
});

describe('url builders', () => {
  it('cdliUrl prefixes the CDLI base', () => {
    expect(cdliUrl('/artifacts/1.json')).toBe('https://cdli.earth/artifacts/1.json');
  });
  it('cdliArtifactUrl normalizes the id', () => {
    expect(cdliArtifactUrl('P000042')).toBe('https://cdli.earth/artifacts/42');
  });
});

describe('cdliFetch', () => {
  it('returns parsed JSON on 200', async () => {
    mockFetch(async () => ok({ id: 1 }));
    expect(await cdliFetch('https://x/a1')).toEqual({ id: 1 });
  });

  it('maps 404 to NOT_FOUND (non-retryable)', async () => {
    mockFetch(async () => ({ ok: false, status: 404 }));
    await expect(cdliFetch('https://x/f404')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      retryable: false,
    });
  });

  it('maps 500 to UPSTREAM_ERROR (retryable)', async () => {
    mockFetch(async () => ({ ok: false, status: 500 }));
    await expect(cdliFetch('https://x/f500')).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_ERROR,
      retryable: true,
    });
  });

  it('maps an aborted request to TIMEOUT', async () => {
    mockFetch(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    await expect(cdliFetch('https://x/slow', 20)).rejects.toMatchObject({
      code: ErrorCode.TIMEOUT,
      retryable: true,
    });
  });

  it('serves repeats of a successful fetch from cache (one network call)', async () => {
    const spy = vi.fn(async () => ok({ id: 7 }));
    vi.stubGlobal('fetch', spy);
    await cdliFetch('https://x/cache-unique');
    await cdliFetch('https://x/cache-unique');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('cdliFetchText', () => {
  it('returns text on 200', async () => {
    mockFetch(async () => ({ ok: true, status: 200, text: async () => 'atf-body' }));
    expect(await cdliFetchText('https://x/t200')).toEqual({ ok: true, text: 'atf-body' });
  });

  it('surfaces 404 and 406 as non-error outcomes', async () => {
    mockFetch(async () => ({ ok: false, status: 406 }));
    expect(await cdliFetchText('https://x/t406')).toEqual({ ok: false, status: 406 });
    mockFetch(async () => ({ ok: false, status: 404 }));
    expect(await cdliFetchText('https://x/t404')).toEqual({ ok: false, status: 404 });
  });

  it('throws UPSTREAM_ERROR for 500', async () => {
    mockFetch(async () => ({ ok: false, status: 500 }));
    await expect(cdliFetchText('https://x/t500')).rejects.toMatchObject({
      code: ErrorCode.UPSTREAM_ERROR,
    });
  });
});

describe('cdliFetchWithHeaders', () => {
  it('returns data and the response headers on 200', async () => {
    const headers = new Headers({ link: '<u>; rel="next"' });
    mockFetch(async () => ({ ok: true, status: 200, json: async () => [{ id: 1 }], headers }));
    const r = await cdliFetchWithHeaders('https://x/h200');
    expect(r.data).toEqual([{ id: 1 }]);
    expect(r.headers.get('link')).toContain('rel="next"');
  });

  it('maps 404 to NOT_FOUND', async () => {
    mockFetch(async () => ({ ok: false, status: 404 }));
    await expect(cdliFetchWithHeaders('https://x/h404')).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
    });
  });
});
