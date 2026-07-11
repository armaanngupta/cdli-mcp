import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export const PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'groq'] as const;
export type Provider = (typeof PROVIDERS)[number];

// Cheap tool-capable default per provider; overridable per request.
const DEFAULT_MODEL: Record<Provider, string> = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash',
  mistral: 'mistral-small-latest',
  groq: 'llama-3.3-70b-versatile',
};

const FACTORIES: Record<
  Provider,
  (options: { apiKey: string }) => (modelId: string) => LanguageModel
> = {
  openai: createOpenAI,
  anthropic: createAnthropic,
  google: createGoogleGenerativeAI,
  mistral: createMistral,
  groq: createGroq,
};

export function resolveModel(provider: Provider, byomKey: string, model?: string): LanguageModel {
  return FACTORIES[provider]({ apiKey: byomKey })(model ?? DEFAULT_MODEL[provider]);
}
