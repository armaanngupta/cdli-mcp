import 'dotenv/config';
import express from 'express';
import { messageRouter } from './routes/message.js';

const port = parseInt(process.env.PORT ?? '8090', 10);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(messageRouter);

const server = app.listen(port, () => {
  console.log(`CDLI chat backend listening on http://localhost:${port}/chat/api/message`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
