import type { ProviderId } from "../core/types.js";
import {
  anthropicAdapter,
  azureOpenAiAdapter,
  geminiAdapter,
  openAiCompatibleAdapter,
  openAiResponsesAdapter
} from "./adapters.js";
import type { ProviderAdapter } from "./types.js";

export const PROVIDER_IDS: ProviderId[] = [
  "openai-compatible",
  "openai-responses",
  "anthropic",
  "gemini",
  "azure-openai"
];

const adapters = new Map<ProviderId, ProviderAdapter>([
  [openAiCompatibleAdapter.id, openAiCompatibleAdapter],
  [openAiResponsesAdapter.id, openAiResponsesAdapter],
  [anthropicAdapter.id, anthropicAdapter],
  [geminiAdapter.id, geminiAdapter],
  [azureOpenAiAdapter.id, azureOpenAiAdapter]
]);

export function isProviderId(value: string): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}

export function getProviderAdapter(provider: ProviderId): ProviderAdapter {
  const adapter = adapters.get(provider);
  if (!adapter) throw new Error(`Unsupported provider: ${provider}`);
  return adapter;
}

export type { ProviderAdapter } from "./types.js";
