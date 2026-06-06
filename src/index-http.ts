import { startHttp } from './transports/http.js';

const port = parseInt(process.env.PORT ?? '3000', 10);

let server;
try {
  server = await startHttp(port);
} catch (err: unknown) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use — is the server already running?`);
  } else {
    console.error('Failed to start server:', err);
  }
  process.exit(1);
}

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
