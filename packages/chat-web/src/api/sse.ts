export interface SseFrame {
  event: string;
  data: string;
}

/** Read an SSE body, invoking `onFrame` once per complete `event:`/`data:` block. */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    // The paper agent (sse-starlette) terminates lines with CRLF, while this backend's own
    // sendEvent uses LF. Strip CR so one parser handles both — a raw CR is never valid
    // inside the JSON payload, so this can't corrupt data.
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const frame = parseFrame(buffer.slice(0, sep));
      if (frame) onFrame(frame);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf('\n\n');
    }
  }
}

function parseFrame(raw: string): SseFrame | null {
  let event = '';
  let data = '';
  for (const line of raw.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  return event && data ? { event, data } : null;
}

/** Read the JSON error body a route sends when it fails before opening the stream. */
export async function failureMessage(res: Response): Promise<string> {
  const body: { error?: { message?: string } } | null = await res.json().catch(() => null);
  return body?.error?.message ?? `Request failed (${res.status})`;
}
