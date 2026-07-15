import type { Response } from 'express';

export function openSse(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Belt-and-braces with the nginx `proxy_buffering off` block: this header disables
    // buffering per-response even if a proxy in front missed that config.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
}

export function sendEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
