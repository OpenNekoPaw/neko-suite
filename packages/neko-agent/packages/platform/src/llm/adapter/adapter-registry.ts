/**
 * Adapter Registry - Factory for creating adapters
 *
 * Extends BaseRegistry to provide LLM adapter management.
 */

import { BaseRegistry } from '../../core/base-registry';
import type { Adapter } from '../../types/adapter';
import type { ProviderType } from '../../types/provider';
import { OpenAIAdapter } from './openai-adapter';
import { AnthropicAdapter } from './anthropic-adapter';
import { GoogleAdapter } from './google-adapter';
import { AzureAdapter } from './azure-adapter';
import { OllamaAdapter } from './ollama-adapter';
import { GenericAdapter } from './generic-adapter';

/**
 * Adapter registry for creating adapters by provider type
 *
 * Inherits from BaseRegistry to share common registry functionality
 * with MediaAdapterRegistry.
 */
export class AdapterRegistry extends BaseRegistry<ProviderType, Adapter> {
  constructor() {
    super();
    this.initializeBuiltins();
  }

  /**
   * Initialize built-in adapters
   */
  private initializeBuiltins(): void {
    this.builtinItems.set('openai', new OpenAIAdapter());
    this.builtinItems.set('anthropic', new AnthropicAdapter());
    this.builtinItems.set('google', new GoogleAdapter());
    this.builtinItems.set('azure', new AzureAdapter());
    this.builtinItems.set('ollama', new OllamaAdapter());
    this.builtinItems.set('generic', new GenericAdapter());
    // NewAPI is OpenAI-compatible, use GenericAdapter
    this.builtinItems.set('newapi', new GenericAdapter());
    this.builtinItems.set('oneapi', new GenericAdapter());
  }
}

// Singleton instance
let registryInstance: AdapterRegistry | null = null;

/**
 * Get the global adapter registry instance
 */
export function getAdapterRegistry(): AdapterRegistry {
  if (!registryInstance) {
    registryInstance = new AdapterRegistry();
  }
  return registryInstance;
}

/**
 * Create a new adapter registry (for testing)
 */
export function createAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry();
}
