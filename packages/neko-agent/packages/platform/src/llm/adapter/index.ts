/**
 * Adapter Module - Public API
 */

export { BaseAdapter } from './base-adapter';
export { AISdkAdapter } from './ai-sdk-adapter';
export { OpenAIAdapter } from './openai-adapter';
export { AnthropicAdapter } from './anthropic-adapter';
export { GoogleAdapter } from './google-adapter';
export { AzureAdapter } from './azure-adapter';
export { OllamaAdapter } from './ollama-adapter';
export { GenericAdapter } from './generic-adapter';
export { AdapterRegistry, getAdapterRegistry, createAdapterRegistry } from './adapter-registry';
export { aggregateStream, createStreamCollector } from './stream-aggregator';
