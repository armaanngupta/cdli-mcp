import { startHttp } from './transports/http.js';

const port = parseInt(process.env.PORT ?? '3000', 10);
await startHttp(port);
