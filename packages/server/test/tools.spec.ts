import { describe, it, expect, vi, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

async function connect(): Promise<Client> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function textOf(result: { content: unknown[] }): string {
  return (result.content[0] as { text: string }).text;
}

afterEach(() => vi.unstubAllGlobals());

describe('server registration', () => {
  it('registers exactly the 9 exposed tools', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'advanced_search',
      'cqp_query',
      'get_bibliography',
      'get_inscription',
      'get_metadata',
      'ping',
      'search_entity',
      'show_artifact_cards',
      'show_inscription',
    ]);
    await client.close();
  });

  // The point of the split: retrieval tools carry no UI, so a widget cannot render on
  // every intermediate call. Only the display tools do.
  it('binds a UI to the display tools only', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const withUi = tools
      .filter((t) => {
        const meta = t._meta as { ui?: { resourceUri?: string } } | undefined;
        return meta?.ui?.resourceUri !== undefined || meta?.['ui/resourceUri'] !== undefined;
      })
      .map((t) => t.name)
      .sort();
    expect(withUi).toEqual(['show_artifact_cards', 'show_inscription']);
    await client.close();
  });

  it('ping returns pong', async () => {
    const client = await connect();
    expect(textOf(await client.callTool({ name: 'ping', arguments: {} }))).toBe('pong');
    await client.close();
  });
});

describe('input guards (no network)', () => {
  it('cqp_query rejects an unjoined multi-token query with INVALID_INPUT', async () => {
    const client = await connect();
    const r = await client.callTool({
      name: 'cqp_query',
      arguments: { cqp_query: 'w1:[ ( conll:FORM = "a" ) ] w2:[ ( conll:FORM = "b" ) ]' },
    });
    expect(r.isError).toBe(true);
    expect(JSON.parse(textOf(r)).code).toBe('INVALID_INPUT');
    await client.close();
  });

  it('advanced_search rejects an empty query with NO_FILTERS', async () => {
    const client = await connect();
    const r = await client.callTool({ name: 'advanced_search', arguments: {} });
    expect(r.isError).toBe(true);
    expect(JSON.parse(textOf(r)).code).toBe('NO_FILTERS');
    await client.close();
  });
});

describe('get_inscription (mocked network)', () => {
  it('returns the ATF for an inscribed artifact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => [{ inscription: { atf: '1. lugal' } }],
      })),
    );
    const client = await connect();
    const r = await client.callTool({ name: 'get_inscription', arguments: { id: '900001' } });
    expect(textOf(r)).toContain('1. lugal');
    await client.close();
  });

  it('reports when no inscription is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => [{}] })),
    );
    const client = await connect();
    const r = await client.callTool({ name: 'get_inscription', arguments: { id: '900002' } });
    expect(textOf(r)).toContain('No inscription available');
    await client.close();
  });
});

describe('tool happy paths (mocked network)', () => {
  const okJson = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
  const stub = (impl: () => Promise<unknown>) => vi.stubGlobal('fetch', vi.fn(impl));
  const second = (r: { content: unknown[] }) => (r.content[1] as { text: string }).text;

  it('get_metadata denoises an artifact fetched by id', async () => {
    stub(async () => okJson([{ id: 5, artifact_id: 9, designation: 'D' }]));
    const client = await connect();
    const r = await client.callTool({
      name: 'get_metadata',
      arguments: { entity: 'artifacts', id: '5' },
    });
    expect(textOf(r)).toContain('"designation":"D"');
    expect(textOf(r)).not.toContain('artifact_id');
    await client.close();
  });

  it('search_entity passes the API results through', async () => {
    stub(async () => okJson([{ id: 1, author: 'Owen' }]));
    const client = await connect();
    const r = await client.callTool({
      name: 'search_entity',
      arguments: { entity: 'authors', filters: { author: 'Owen' } },
    });
    expect(textOf(r)).toContain('Owen');
    await client.close();
  });

  it('get_bibliography compresses the publications', async () => {
    stub(async () =>
      okJson([
        {
          publications: [{ publication_type: 'primary', publication: { designation: 'MVN 3, 1' } }],
        },
      ]),
    );
    const client = await connect();
    const r = await client.callTool({ name: 'get_bibliography', arguments: { id: '900003' } });
    expect(textOf(r)).toContain('publication(s) found');
    expect(textOf(r)).toContain('MVN 3, 1');
    await client.close();
  });

  it('advanced_search grounds terms and returns summary cards', async () => {
    stub(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 42, designation: 'Test', period: { name: 'Ur III' } }],
      headers: new Headers(),
    }));
    const client = await connect();
    const r = await client.callTool({ name: 'advanced_search', arguments: { period: 'Ur 3' } });
    expect(textOf(r)).toContain('"designation":"Test"');
    expect(second(r)).toContain('1 artifact(s) match.');
    expect(second(r)).toContain('Ur III');
    await client.close();
  });

  it('cqp_query formats KWIC lines prefixed with the source P-number', async () => {
    stub(async () =>
      okJson({
        page: 1,
        first_page: true,
        last_page: true,
        results: [
          {
            l_context: [{ word: 'e2', link: '' }],
            keywords: [{ word: 'lugal', link: 'https://x/P100065.conll#s1_2' }],
            r_context: [],
          },
        ],
      }),
    );
    const client = await connect();
    const r = await client.callTool({
      name: 'cqp_query',
      arguments: { cqp_query: 'w1:[ ( conll:FORM = "lugal" ) ]' },
    });
    expect(textOf(r)).toContain('P100065');
    expect(textOf(r)).toContain('[lugal]');
    await client.close();
  });
});
