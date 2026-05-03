import type { Adapter } from '../types/adapter';
import type { Model, Provider } from '../types/provider';

export interface OllamaModelRefreshConfig {
  getProviders(): Provider[];
  getModelsByProvider(providerId: string): Model[];
  setModel(model: Model): Promise<void>;
}

export interface OllamaModelRefreshProviderRegistry {
  getAdapter(providerId: string): Adapter | undefined;
}

export interface OllamaModelRefreshLogger {
  warn?(message: string, metadata?: unknown): void;
}

export interface RefreshOllamaModelsInput {
  readonly config: OllamaModelRefreshConfig;
  readonly providers: OllamaModelRefreshProviderRegistry;
  readonly logger?: OllamaModelRefreshLogger;
}

export interface RefreshOllamaModelsResult {
  readonly added: number;
  readonly checkedProviders: number;
  readonly failedProviders: readonly string[];
}

export async function refreshOllamaModels(
  input: RefreshOllamaModelsInput,
): Promise<RefreshOllamaModelsResult> {
  const ollamaProviders = input.config
    .getProviders()
    .filter((provider) => provider.type === 'ollama');
  let added = 0;
  const failedProviders: string[] = [];

  for (const provider of ollamaProviders) {
    const adapter = input.providers.getAdapter(provider.id);
    if (!adapter?.listModels) {
      failedProviders.push(provider.id);
      continue;
    }

    try {
      const existing = new Set(
        input.config.getModelsByProvider(provider.id).map((model) => model.name),
      );
      const discovered = await adapter.listModels(provider);

      for (const name of discovered) {
        if (!name || existing.has(name)) continue;
        await input.config.setModel({
          id: `${provider.id}-${name}`,
          name,
          providerId: provider.id,
          capabilities: ['chat'],
          enabled: true,
        });
        existing.add(name);
        added++;
      }
    } catch (error) {
      failedProviders.push(provider.id);
      input.logger?.warn?.('Failed to refresh Ollama models', {
        providerId: provider.id,
        error,
      });
    }
  }

  return {
    added,
    checkedProviders: ollamaProviders.length,
    failedProviders,
  };
}
