import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { verifyIdentity } from '../auth/verify.js';
import { PROVIDERS } from '../llm/provider.js';
import type { Provider } from '../llm/provider.js';
import { applyRateLimit } from '../ratelimit/limiter.js';
import { ChatError, ErrorCode, sendError } from '../util/errors.js';
import { openSse } from '../util/sse.js';

const PAPER_URL = process.env.PAPER_URL ?? 'http://localhost:8100';

// The paper agent is a LangChain service, which names providers differently from the
// Vercel AI SDK this backend uses.
const LANGCHAIN_PROVIDER: Record<Provider, string> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google_genai',
  mistral: 'mistralai',
  groq: 'groq',
};

const bodySchema = z.object({
  topic: z.string().min(1),
  provider: z.enum(PROVIDERS),
  // Required, unlike /message: a paper run is 15-30 LLM calls against 1-2 for a chat turn,
  // so it is bring-your-own-model even for logged-in users. There is no funded path.
  byomKey: z.string().min(1),
  model: z.string().min(1).optional(),
  filters: z.record(z.string()).optional(),
});

type ParsedBody = z.infer<typeof bodySchema>;

export const paperRouter = Router();

paperRouter.post('/chat/api/paper', (req: Request, res: Response) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(
      res,
      new ChatError(
        ErrorCode.INVALID_INPUT,
        400,
        parsed.error.issues[0]?.message ?? 'Invalid body',
      ),
    );
    return;
  }

  const identity = verifyIdentity(req.header('authorization'));
  req.identity = identity;

  // Always the BYOM tier — the funded path is unreachable here by design.
  applyRateLimit(identity, false, req, res, () => {
    void proxyRun(res, parsed.data);
  });
});

async function proxyRun(res: Response, body: ParsedBody): Promise<void> {
  const abort = new AbortController();
  // 'close' also fires after a normal end — only a close before we finished is a disconnect.
  res.on('close', () => {
    if (!res.writableEnded) {
      console.error('[turn:paper] client disconnected — aborting');
      abort.abort();
    }
  });

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${PAPER_URL}/paper`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: body.topic,
        api_key: body.byomKey,
        provider: LANGCHAIN_PROVIDER[body.provider],
        ...(body.model ? { model: body.model } : {}),
        ...(body.filters ? { filters: body.filters } : {}),
      }),
      signal: abort.signal,
    });
  } catch (err) {
    sendError(res, new ChatError(ErrorCode.UPSTREAM_ERROR, 502, `Paper agent unreachable: ${err}`));
    return;
  }

  // Validation failures arrive before the stream opens, so they can still be a clean JSON
  // error rather than an SSE error event.
  if (!upstream.ok || !upstream.body) {
    sendError(
      res,
      new ChatError(
        ErrorCode.UPSTREAM_ERROR,
        502,
        `Paper agent rejected the run (${upstream.status})`,
      ),
    );
    return;
  }

  openSse(res);

  // The agent already emits well-formed SSE, so forward bytes verbatim rather than
  // re-encoding — any re-framing here would only risk corrupting event boundaries.
  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (err) {
    if (!abort.signal.aborted) console.error('[turn:paper] stream failed', err);
  } finally {
    res.end();
  }
}
