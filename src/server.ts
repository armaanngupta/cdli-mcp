import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGetMetadata } from './tools/get_metadata.js';
import { registerPing } from './tools/ping.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'cdli-mcp',
    version: '0.1.0',
  });

  registerPing(server);
  registerGetMetadata(server);

  return server;
}
