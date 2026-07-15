import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// The MCP server is stateless (no session ids), so a fresh connect per turn is cheap.
// The tool list is static per server build — cached in-process after the first fetch.
let cachedTools: Tool[] | undefined;

function mcpUrl(): string {
  return process.env.MCP_URL ?? 'http://localhost:3000/mcp';
}

export async function connectMcp(): Promise<Client> {
  const client = new Client({ name: 'cdli-chat-backend', version: '0.1.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl())));
  return client;
}

export async function listTools(client: Client): Promise<Tool[]> {
  if (!cachedTools) {
    cachedTools = (await client.listTools()).tools;
  }
  return cachedTools;
}

export interface ToolCallOutcome {
  text: string;
  isError: boolean;
}

export async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ToolCallOutcome> {
  const result = await client.callTool({ name, arguments: args }, undefined, { signal });
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content
    .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
    .map((item) => item.text)
    .join('\n');
  return { text, isError: result.isError === true };
}
