/**
 * Local Model Discovery - Auto-discover local models
 */

import type { Model } from '../types/provider';

/**
 * Discover Ollama models
 */
export async function discoverOllamaModels(
  apiUrl: string = 'http://localhost:11434/api'
): Promise<Model[]> {
  try {
    const response = await fetch(`${apiUrl}/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      models: Array<{
        name: string;
        model: string;
        modified_at: string;
        size: number;
        digest: string;
        details?: {
          parameter_size?: string;
          quantization_level?: string;
        };
      }>;
    };

    return data.models.map((m) => ({
      id: `ollama:${m.name}`,
      name: m.name,
      displayName: m.name,
      providerId: 'ollama',
      capabilities: inferOllamaCapabilities(m.name),
      contextWindow: inferContextWindow(m.name),
      enabled: true,
      options: {
        apiUrl,
        modelName: m.name,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Discover LM Studio models
 */
export async function discoverLMStudioModels(
  apiUrl: string = 'http://localhost:1234/v1'
): Promise<Model[]> {
  try {
    const response = await fetch(`${apiUrl}/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as {
      data: Array<{
        id: string;
        object: string;
        owned_by: string;
      }>;
    };

    return data.data.map((m) => ({
      id: `lmstudio:${m.id}`,
      name: m.id,
      displayName: m.id,
      providerId: 'lmstudio',
      capabilities: ['chat', 'streaming'] as Model['capabilities'],
      contextWindow: 4096,
      enabled: true,
      options: {
        apiUrl,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Discover all local models
 */
export async function discoverLocalModels(): Promise<Model[]> {
  const [ollamaModels, lmStudioModels] = await Promise.all([
    discoverOllamaModels(),
    discoverLMStudioModels(),
  ]);

  return [...ollamaModels, ...lmStudioModels];
}

/**
 * Infer capabilities from Ollama model name
 */
function inferOllamaCapabilities(modelName: string): Model['capabilities'] {
  const name = modelName.toLowerCase();
  const capabilities: Model['capabilities'] = ['chat', 'streaming'];

  // Vision models
  if (name.includes('llava') || name.includes('vision') || name.includes('bakllava')) {
    capabilities.push('vision');
  }

  // Code models
  if (name.includes('code') || name.includes('deepseek-coder') || name.includes('starcoder')) {
    capabilities.push('code');
  }

  // Embedding models
  if (name.includes('embed') || name.includes('nomic-embed')) {
    return ['embedding'];
  }

  return capabilities;
}

/**
 * Infer context window from model name
 */
function inferContextWindow(modelName: string): number {
  const name = modelName.toLowerCase();

  // Look for context size in name
  const contextMatch = name.match(/(\d+)k/);
  if (contextMatch) {
    return parseInt(contextMatch[1]) * 1024;
  }

  // Known models
  if (name.includes('llama3')) return 8192;
  if (name.includes('llama2')) return 4096;
  if (name.includes('mistral')) return 32768;
  if (name.includes('mixtral')) return 32768;
  if (name.includes('phi')) return 2048;
  if (name.includes('gemma')) return 8192;
  if (name.includes('qwen')) return 32768;

  return 4096; // Default
}
