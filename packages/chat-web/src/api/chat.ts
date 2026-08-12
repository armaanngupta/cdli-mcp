import { failureMessage, readSse } from './sse';
import type { SseFrame } from './sse';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ToolStatus = 'started' | 'finished' | 'error';

export interface ChatRequest {
  messages: ChatMessage[];
  provider: string;
  byomKey: string;
  model?: string;
}

export interface StreamHandlers {
  onToken: (text: string) => void;
  onTool: (name: string, status: ToolStatus) => void;
  onDone: (toolCallCount: number) => void;
  onError: (message: string) => void;
}

interface EventPayload {
  text?: string;
  name?: string;
  status?: ToolStatus;
  toolCallCount?: number;
  message?: string;
}

export async function streamChat(
  request: ChatRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/chat/api/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!res.ok || !res.body) {
    handlers.onError(await failureMessage(res));
    return;
  }

  await readSse(res.body, (frame) => dispatch(frame, handlers));
}

function dispatch(frame: SseFrame, handlers: StreamHandlers): void {
  const payload = JSON.parse(frame.data) as EventPayload;
  switch (frame.event) {
    case 'token':
      handlers.onToken(payload.text ?? '');
      break;
    case 'tool':
      handlers.onTool(payload.name ?? 'tool', payload.status ?? 'started');
      break;
    case 'done':
      handlers.onDone(payload.toolCallCount ?? 0);
      break;
    case 'error':
      handlers.onError(payload.message ?? 'Unknown error');
      break;
  }
}
