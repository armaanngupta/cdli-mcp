import { dynamicTool, jsonSchema, stepCountIs, streamText } from 'ai';
import type { JSONSchema7, LanguageModel, ModelMessage, ToolSet } from 'ai';
import { extractCards } from './artifacts.js';
import type { ArtifactCard } from './artifacts.js';
import { callTool, connectMcp, listTools } from './mcpClient.js';
import { SYSTEM_PROMPT } from '../prompt/system.js';
import { ChatError, ErrorCode } from '../util/errors.js';

// The MCP server documents this guard in its tool descriptions; the host enforces it here.
const MAX_TOOL_CALLS = 25;
// Backstop so the turn terminates even if the model keeps requesting tools after the cap:
// up to MAX_TOOL_CALLS tool steps + the refusal step + a final answer step.
const MAX_STEPS = MAX_TOOL_CALLS + 2;

export type ToolStatus = 'started' | 'finished' | 'error';

export interface TurnEvents {
  onToken: (text: string) => void;
  onTool: (name: string, status: ToolStatus) => void;
  /** Artifact cards seen in a tool's output, for the SPA's citation cards. */
  onArtifacts: (cards: ArtifactCard[]) => void;
}

export interface AgentResult {
  toolCallCount: number;
}

export async function runAgentTurn(
  model: LanguageModel,
  messages: ModelMessage[],
  events: TurnEvents,
  abortSignal: AbortSignal,
  // Resolved by the route, so the loop stays unaware of slash commands.
  system: string = SYSTEM_PROMPT,
): Promise<AgentResult> {
  const client = await connectMcp();
  try {
    // The server's show_* tools exist for MCP Apps hosts, which render a ui:// widget per
    // tool result. This host renders artifact cards natively from the `artifacts` event, so
    // offering them here would buy nothing and cost plenty: the model calls one at the end,
    // it re-fetches every artifact individually, and its raw JSON lands in the answer.
    const mcpTools = (await listTools(client)).filter((t) => !t.name.startsWith('show_'));
    let toolCallCount = 0;

    const tools: ToolSet = Object.fromEntries(
      mcpTools.map((mcpTool) => [
        mcpTool.name,
        dynamicTool({
          description: mcpTool.description ?? '',
          inputSchema: jsonSchema(mcpTool.inputSchema as JSONSchema7),
          execute: async (input, options) => {
            toolCallCount += 1;
            if (toolCallCount > MAX_TOOL_CALLS) {
              return `Tool-call limit for this turn (${MAX_TOOL_CALLS}) reached. Answer with the information gathered so far.`;
            }
            const outcome = await callTool(
              client,
              mcpTool.name,
              input as Record<string, unknown>,
              options.abortSignal,
            );
            if (outcome.isError) return `TOOL ERROR: ${outcome.text}`;
            const cards = extractCards(outcome.text);
            if (cards.length) events.onArtifacts(cards);
            return outcome.text;
          },
        }),
      ]),
    );

    const stream = streamText({
      model,
      system,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal,
    });

    for await (const part of stream.fullStream) {
      switch (part.type) {
        case 'text-delta':
          events.onToken(part.text);
          break;
        case 'tool-call':
          events.onTool(part.toolName, 'started');
          break;
        case 'tool-result':
          events.onTool(part.toolName, 'finished');
          break;
        case 'tool-error':
          events.onTool(part.toolName, 'error');
          break;
        case 'error':
          throw new ChatError(ErrorCode.UPSTREAM_ERROR, 502, String(part.error));
      }
    }

    return { toolCallCount };
  } finally {
    await client.close();
  }
}
