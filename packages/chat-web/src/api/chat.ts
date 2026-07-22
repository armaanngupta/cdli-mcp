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
    const body: { error?: { message?: string } } | null = await res.json().catch(() => null);
    handlers.onError(body?.error?.message ?? `Request failed (${res.status})`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      dispatch(buffer.slice(0, sep), handlers);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf('\n\n');
    }
  }
}

function dispatch(frame: string, handlers: StreamHandlers): void {
  let event = '';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  if (!event || !data) return;

  const payload = JSON.parse(data) as EventPayload;
  switch (event) {
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
