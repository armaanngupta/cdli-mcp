import { describe, it, expect } from 'vitest';
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

const VIEW_URI = 'ui://inscription/view.html';
const CARD_URI = 'ui://artifact-card/view.html';

describe('inscription MCP App', () => {
  it('lists the ui:// resource with the MCP Apps MIME type', async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    const view = resources.find((r) => r.uri === VIEW_URI);
    expect(view).toBeDefined();
    expect(view?.mimeType).toBe('text/html;profile=mcp-app');
    await client.close();
  });

  it('serves the self-contained HTML on resources/read', async () => {
    const client = await connect();
    const { contents } = await client.readResource({ uri: VIEW_URI });
    const text = (contents[0] as { text: string }).text;
    expect(contents[0].mimeType).toBe('text/html;profile=mcp-app');
    expect(text).toContain('<div id="root">');
    expect(text).not.toContain('__APP_SCRIPT__');
    expect(text).toContain('<script>');
    await client.close();
  });

  // The view hangs off show_inscription, not get_inscription: binding it to retrieval
  // rendered a widget on every intermediate call while the model was still working.
  it('links show_inscription to the view via _meta', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'show_inscription');
    expect(tool?._meta?.ui).toMatchObject({ resourceUri: VIEW_URI });
    await client.close();
  });

  it('leaves get_inscription with no view', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'get_inscription');
    expect(tool?._meta?.ui).toBeUndefined();
    await client.close();
  });

});

describe('artifact-card MCP App', () => {
  it('lists the ui:// resource with the MCP Apps MIME type', async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    const view = resources.find((r) => r.uri === CARD_URI);
    expect(view).toBeDefined();
    expect(view?.mimeType).toBe('text/html;profile=mcp-app');
    await client.close();
  });

  it('serves the self-contained HTML on resources/read', async () => {
    const client = await connect();
    const { contents } = await client.readResource({ uri: CARD_URI });
    const text = (contents[0] as { text: string }).text;
    expect(contents[0].mimeType).toBe('text/html;profile=mcp-app');
    expect(text).toContain('<div id="root">');
    expect(text).not.toContain('__APP_SCRIPT__');
    expect(text).toContain('<script>');
    await client.close();
  });

  it('links show_artifact_cards to the view via _meta', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'show_artifact_cards');
    expect(tool?._meta?.ui).toMatchObject({ resourceUri: CARD_URI });
    await client.close();
  });

  it('leaves advanced_search with no view', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'advanced_search');
    expect(tool?._meta?.ui).toBeUndefined();
    await client.close();
  });

  it('registers no other app resources', async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(2);
    await client.close();
  });
});
