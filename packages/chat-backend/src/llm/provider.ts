import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export const PROVIDERS = ['openai', 'anthropic', 'google', 'mistral', 'groq', 'openrouter'] as const;
export type Provider = (typeof PROVIDERS)[number];

// OpenRouter is OpenAI-API-compatible: the same client, a different base URL. One key reaches
// every vendor, so model ids are vendor-namespaced (e.g. "anthropic/claude-3.5-sonnet").
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Cheap tool-capable default per provider; overridable per request.
const DEFAULT_MODEL: Record<Provider, string> = {
  openai: 'gpt-5-mini',
  anthropic: 'claude-haiku-4-5',
  google: 'gemini-2.5-flash',
  mistral: 'mistral-small-latest',
  groq: 'llama-3.3-70b-versatile',
  openrouter: 'openai/gpt-4o-mini',
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
  openrouter: ({ apiKey }) => createOpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL }),
};

export function resolveModel(provider: Provider, byomKey: string, model?: string): LanguageModel {
  return FACTORIES[provider]({ apiKey: byomKey })(model ?? DEFAULT_MODEL[provider]);
}

export function defaultModelFor(provider: Provider): string {
  return DEFAULT_MODEL[provider];
}
