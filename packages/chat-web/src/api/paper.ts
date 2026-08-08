import { failureMessage, readSse } from './sse';
import type { SseFrame } from './sse';

export type NodeStatus = 'started' | 'finished';

export interface PaperRequest {
  topic: string;
  provider: string;
  byomKey: string;
  model?: string;
  filters?: Record<string, string>;
}

export interface PaperHandlers {
  onNode: (name: string, status: NodeStatus, progress?: Record<string, unknown>) => void;
  /** Synthesis is much the longest node, so it reports each finished section from inside. */
  onSection: (label: string, index: number, of: number) => void;
  onDone: (draft: string, unverifiedCitations: string[], artifactIds: string[]) => void;
  onError: (message: string) => void;
}

interface EventPayload {
  name?: string;
  status?: NodeStatus;
  progress?: Record<string, unknown>;
  section?: string;
  index?: number;
  of?: number;
  draft?: string;
  unverified_citations?: string[];
  artifact_ids?: string[];
  message?: string;
}

/**
 * Run `/paper`. Unlike a chat turn there are no token deltas — a run takes minutes and the
 * draft arrives whole at the end, so node transitions are the only progress signal.
 */
export async function streamPaper(
  request: PaperRequest,
  handlers: PaperHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/chat/api/paper', {
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

function dispatch(frame: SseFrame, handlers: PaperHandlers): void {
  const payload = JSON.parse(frame.data) as EventPayload;
  switch (frame.event) {
    case 'node':
      handlers.onNode(payload.name ?? 'node', payload.status ?? 'finished', payload.progress);
      break;
    case 'section':
      handlers.onSection(payload.section ?? '', payload.index ?? 0, payload.of ?? 0);
      break;
    case 'done':
      handlers.onDone(
        payload.draft ?? '',
        payload.unverified_citations ?? [],
        payload.artifact_ids ?? [],
      );
      break;
    case 'error':
      handlers.onError(payload.message ?? 'Unknown error');
      break;
  }
}
