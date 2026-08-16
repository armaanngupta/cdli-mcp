export interface FriendlyError {
  message: string;
  detail: string;
}

// Provider and pipeline errors arrive as heterogeneous strings — a provider SDK's raw JSON,
// an unwrapped Python exception, a fetch failure. Rather than teach every layer to emit a
// code, classify by content in one place and keep the raw text for a details expander.
export function classifyError(raw: string): FriendlyError {
  const t = raw.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => t.includes(n));

  let message: string;
  if (has('no artifacts found')) {
    message = 'No CDLI artifacts matched that topic. Try a broader or differently worded topic.';
  } else if (
    has('401', 'unauthorized', 'invalid api key', 'incorrect api key', 'invalid_api_key')
  ) {
    message =
      'That API key was rejected. Check the key for your selected provider and re-enter it.';
  } else if (has('402', 'insufficient', 'credit', 'payment required', 'billing')) {
    message =
      'The provider reports too little credit for this request. Add credit, or choose a cheaper model.';
  } else if (has('429', 'rate limit', 'rate_limit', 'too many requests')) {
    message = 'The provider is rate-limiting requests. Wait a few seconds and try again.';
  } else if (
    has('model_not_found', 'no endpoints found', 'is not a valid model', 'unknown model') ||
    (has('model') && has('not found', 'does not exist', 'not exist'))
  ) {
    message = "That model isn't available for the selected provider. Pick a different model.";
  } else if (
    has(
      'unreachable',
      'fetch failed',
      'failed to fetch',
      'econnrefused',
      '502',
      '503',
      'bad gateway',
    )
  ) {
    message = 'The service or corpus is unreachable right now. Please try again shortly.';
  } else if (has('timeout', 'timed out', 'etimedout')) {
    message = 'The request timed out — the corpus or model is slow right now. Try again.';
  } else if (
    // Groq phrases a malformed tool call as "Failed to call a function".
    has('did not call a tool', 'tool_use_failed', 'tool choice', 'failed to call a function')
  ) {
    message = 'The selected model mishandled a tool call. Try a different model.';
  } else if (has('importerror', 'no module named', 'requires the', 'please install')) {
    message = "This provider isn't available on the server right now. Try a different provider.";
  } else {
    message = 'Something went wrong. See the details below, or try again.';
  }

  return { message, detail: raw };
}
