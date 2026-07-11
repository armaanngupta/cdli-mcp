import { dynamicTool, generateText, jsonSchema, stepCountIs } from 'ai';
import type { JSONSchema7, LanguageModel, ModelMessage, ToolSet } from 'ai';
import { callTool, connectMcp, listTools } from './mcpClient.js';
import { SYSTEM_PROMPT } from '../prompt/system.js';

// The MCP server documents this guard in its tool descriptions; the host enforces it here.
const MAX_TOOL_CALLS = 25;
// Backstop so the turn terminates even if the model keeps requesting tools after the cap:
// up to MAX_TOOL_CALLS tool steps + the refusal step + a final answer step.
const MAX_STEPS = MAX_TOOL_CALLS + 2;

export interface AgentResult {
  reply: string;
  toolCallCount: number;
}

export async function runAgentTurn(
  model: LanguageModel,
  messages: ModelMessage[],
): Promise<AgentResult> {
  const client = await connectMcp();
  try {
    const mcpTools = await listTools(client);
    let toolCallCount = 0;

    const tools: ToolSet = Object.fromEntries(
      mcpTools.map((mcpTool) => [
        mcpTool.name,
        dynamicTool({
          description: mcpTool.description ?? '',
          inputSchema: jsonSchema(mcpTool.inputSchema as JSONSchema7),
          execute: async (input) => {
            toolCallCount += 1;
            if (toolCallCount > MAX_TOOL_CALLS) {
              return `Tool-call limit for this turn (${MAX_TOOL_CALLS}) reached. Answer with the information gathered so far.`;
            }
            const outcome = await callTool(client, mcpTool.name, input as Record<string, unknown>);
            return outcome.isError ? `TOOL ERROR: ${outcome.text}` : outcome.text;
          },
        }),
      ]),
    );

    const result = await generateText({
      model,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
    });

    return { reply: result.text, toolCallCount };
  } finally {
    await client.close();
  }
}
