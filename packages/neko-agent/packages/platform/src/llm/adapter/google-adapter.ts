/**
 * Google AI (Gemini) Adapter - Using AI SDK
 *
 * Uses @ai-sdk/google for API integration.
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { AISdkAdapter } from './ai-sdk-adapter';
import type { ChatOptions, ModelInfo, ModelInfoCapability } from '../../types/adapter';
import type { Model, Provider } from '../../types/provider';

/**
 * Google AI (Gemini) adapter using AI SDK
 */
export class GoogleAdapter extends AISdkAdapter {
  readonly type = 'google';

  private static readonly DEFAULT_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
  private static readonly ENV_KEY_NAME = 'GOOGLE_API_KEY';

  protected getSupportedCapabilities(): string[] {
    return ['chat', 'vision', 'function_calling', 'streaming', 'audio'];
  }

  /**
   * Get the AI SDK Google language model
   */
  protected getLanguageModel(model: Model, provider: Provider): LanguageModel {
    const apiKey = provider.apiKey || process.env[GoogleAdapter.ENV_KEY_NAME];
    if (!apiKey) {
      throw new Error('Google API key not configured');
    }

    const baseURL = provider.apiUrl || GoogleAdapter.DEFAULT_API_URL;

    const google = createGoogleGenerativeAI({
      apiKey,
      baseURL,
    });

    return google(model.name);
  }

  /**
   * Get Google-specific provider options
   */
  protected override getProviderOptions(_options: ChatOptions, _provider: Provider, _model: Model): Record<string, unknown> {
    // Google-specific options can be added here
    return {};
  }

  /**
   * List available models
   */
  async listModels(_provider: Provider): Promise<string[]> {
    // Google doesn't have a public models list API, return known models
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.0-pro',
    ];
  }

  /**
   * List available models with details
   */
  async listModelsDetailed(_provider: Provider): Promise<ModelInfo[]> {
    const models = await this.listModels(_provider);
    return models.map((id) => this.inferModelCapabilities(id));
  }

  /**
   * Infer model capabilities from model ID
   */
  private inferModelCapabilities(modelId: string): ModelInfo {
    const capabilities: ModelInfoCapability[] = ['chat', 'stream'];

    // All Gemini models support vision
    if (modelId.includes('gemini')) {
      capabilities.push('vision');
    }

    // Pro and Flash models support function calling
    if (modelId.includes('pro') || modelId.includes('flash')) {
      capabilities.push('function_call');
    }

    return {
      id: modelId,
      name: this.getModelDisplayName(modelId),
      capabilities,
      owner: 'google',
    };
  }

  /**
   * Get human-readable model name
   */
  private getModelDisplayName(modelId: string): string {
    if (modelId.includes('2.0-flash')) return 'Gemini 2.0 Flash';
    if (modelId.includes('1.5-pro')) return 'Gemini 1.5 Pro';
    if (modelId.includes('1.5-flash-8b')) return 'Gemini 1.5 Flash 8B';
    if (modelId.includes('1.5-flash')) return 'Gemini 1.5 Flash';
    if (modelId.includes('1.0-pro')) return 'Gemini 1.0 Pro';
    return modelId;
  }
}
