import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import type { Server } from 'node:http';
import { createServer } from '../server.js';

const METHOD_NOT_ALLOWED = JSON.stringify({
  jsonrpc: '2.0',
  error: { code: -32000, message: 'Method not allowed.' },
  id: null,
});

export async function startHttp(port: number): Promise<Server> {
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').map((h) => h.trim());
  const app = createMcpExpressApp({ host: '0.0.0.0', ...(allowedHosts && { allowedHosts }) });

  app.use((_req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
    next();
  });

  app.options('/mcp', (_req: Request, res: Response) => {
    res.sendStatus(204);
  });

  app.post('/mcp', async (req: Request, res: Response) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP request error:', error);
      transport.close();
      server.close();
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error.' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', (_req: Request, res: Response) => {
    res.writeHead(405).end(METHOD_NOT_ALLOWED);
  });

  app.delete('/mcp', (_req: Request, res: Response) => {
    res.writeHead(405).end(METHOD_NOT_ALLOWED);
  });

  return new Promise<Server>((resolve, reject) => {
    const httpServer = app.listen(port, () => {
      console.log(`CDLI MCP server (HTTP) listening on http://0.0.0.0:${port}/mcp`);
      resolve(httpServer);
    });
    httpServer.on('error', reject);
  });
}
