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
  // Omitted on the CDLI-funded path, where the backend supplies the key from an identity.
  byomKey?: string;
  model?: string;
}

export interface AuthContext {
  token: string | null;
  /**
   * Called once on a 401 so an identity token that expired mid-session (they last ~15
   * minutes) is replaced without the user seeing an error.
   */
  refresh: () => Promise<string | null>;
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

function post(request: ChatRequest, token: string | null, signal?: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch('/chat/api/message', {
    method: 'POST',
    headers,
    body: JSON.stringify(request),
    signal,
  });
}

export async function streamChat(
  request: ChatRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  auth?: AuthContext,
): Promise<void> {
  let res = await post(request, auth?.token ?? null, signal);

  // A 401 on the funded path usually just means the token aged out. Retry once with a fresh
  // one; a second failure is a real refusal and falls through to the error path below.
  if (res.status === 401 && auth?.token) {
    const fresh = await auth.refresh();
    if (fresh) res = await post(request, fresh, signal);
  }

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
