import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { runAgentTurn } from '../agent/loop.js';
import { PROVIDERS, resolveModel } from '../llm/provider.js';
import { ChatError, ErrorCode, errorBody, sendError } from '../util/errors.js';
import { openSse, sendEvent } from '../util/sse.js';
import { withTiming } from '../util/timing.js';

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      }),
    )
    .min(1),
  provider: z.enum(PROVIDERS),
  byomKey: z.string().min(1),
  model: z.string().min(1).optional(),
});

export type ChatMessage = z.infer<typeof bodySchema>['messages'][number];

export const messageRouter = Router();

messageRouter.post('/chat/api/message', async (req: Request, res: Response) => {
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

  const { messages, provider, byomKey, model } = parsed.data;

  // 'close' also fires after a normal end — only a close before we finished is a disconnect.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.error('[turn:message] client disconnected — aborting');
      abort.abort();
    }
  });

  openSse(res);
  try {
    const result = await withTiming('message', () =>
      runAgentTurn(
        resolveModel(provider, byomKey, model),
        messages,
        {
          onToken: (text) => sendEvent(res, 'token', { text }),
          onTool: (name, status) => sendEvent(res, 'tool', { name, status }),
        },
        abort.signal,
      ),
    );
    if (!abort.signal.aborted) {
      sendEvent(res, 'done', { toolCallCount: result.toolCallCount });
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      sendEvent(res, 'error', errorBody(err));
    }
  } finally {
    res.end();
  }
});
