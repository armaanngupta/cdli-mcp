import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPing(server: McpServer): void {
  server.tool('ping', 'Health check. Returns pong.', {}, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }));
}
