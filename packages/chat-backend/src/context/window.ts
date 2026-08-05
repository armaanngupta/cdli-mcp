  import { getEncoding } from 'js-tiktoken';
import type { ChatMessage } from '../routes/message.js';

// Plan §9.3: ~8-12k tokens of history+results. cl100k_base is a cross-provider approximation
// (this is OpenAI's encoding) — exact per-provider counts aren't the point, relative sizing is.
const TOKEN_BUDGET = 10_000;

const encoding = getEncoding('cl100k_base');

function countTokens(text: string): number {
  return encoding.encode(text).length;
}

// FIFO-drop the oldest turns until the remaining history fits the token budget. Always keeps at
// least the most recent message, even if it alone exceeds budget — never drop the live turn.
export function trimToBudget(messages: ChatMessage[]): ChatMessage[] {
  const counts = messages.map((m) => countTokens(m.content));
  let total = counts.reduce((sum, c) => sum + c, 0);

  let start = 0;
  while (total > TOKEN_BUDGET && start < messages.length - 1) {
    total -= counts[start];
    start += 1;
  }
  return messages.slice(start);
}
