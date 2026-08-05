import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { messageRouter } from './routes/message.js';
import { paperRouter } from './routes/paper.js';
import { ChatError, ErrorCode, sendError } from './util/errors.js';

const port = parseInt(process.env.PORT ?? '8090', 10);

const app = express();
app.use(express.json({ limit: '1mb' }));
// Body-parser failures (malformed JSON, oversize) would otherwise fall through to
// Express's default handler, which leaks an HTML stack trace.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  sendError(res, new ChatError(ErrorCode.INVALID_INPUT, 400, 'Malformed request body'));
});
app.use(messageRouter);
app.use(paperRouter);

const server = app.listen(port, () => {
  console.log(`CDLI chat backend listening on http://localhost:${port}/chat/api/message`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
