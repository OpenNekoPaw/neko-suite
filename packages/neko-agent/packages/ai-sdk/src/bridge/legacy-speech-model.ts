/**
 * Legacy Adapter Bridge - SpeechModelV3 wrapper
 *
 * Wraps a legacy MediaAdapter's generateAudio as an AI SDK SpeechModelV3.
 * Used for music generation (Suno) and other audio adapters.
 */

import type { SpeechModelV3, SpeechModelV3CallOptions, SharedV3Warning } from '@ai-sdk/provider';
import type { LegacyMediaAdapter, LegacyAdapterResult, ProviderConfig } from '../types';
import { pollUntilDone, POLLING_PRESETS } from '../polling';

export class LegacySpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider: string;
  readonly modelId: string;

  constructor(
    provider: string,
    modelId: string,
    private adapter: LegacyMediaAdapter,
    private config: ProviderConfig,
  ) {
    this.provider = provider;
    this.modelId = modelId;
  }

  async doGenerate(options: SpeechModelV3CallOptions): Promise<{
    audio: string | Uint8Array;
    warnings: Array<SharedV3Warning>;
    request?: { body?: unknown };
    response: { timestamp: Date; modelId: string; headers: Record<string, string> | undefined };
  }> {
    // Convert AI SDK options to legacy adapter request
    const request: Record<string, unknown> = {
      prompt: options.text,
      metadata: {
        voice: options.voice,
        speed: options.speed,
        language: options.language,
      },
    };

    const model = { name: this.modelId, id: this.modelId };
    const provider = {
      apiUrl: this.config.apiUrl,
      apiKey: this.config.apiKey,
      type: this.provider,
    };

    // Call legacy adapter
    let result = await this.adapter.generateAudio(request, model, provider);

    // Handle async polling
    if (result.externalTaskId && result.status !== 'completed' && result.status !== 'failed') {
      result = await this.pollForCompletion(result.externalTaskId, provider, options.abortSignal);
    }

    if (result.status === 'failed') {
      throw new Error(result.error?.message ?? 'Audio generation failed');
    }

    // Return URL as string (AI SDK will download if needed)
    const audioUrl = result.outputs?.[0]?.url ?? '';

    return {
      audio: audioUrl,
      warnings: [],
      response: {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: undefined,
      },
    };
  }

  private async pollForCompletion(
    taskId: string,
    provider: unknown,
    abortSignal?: AbortSignal,
  ): Promise<LegacyAdapterResult> {
    return pollUntilDone<LegacyAdapterResult>(
      async () => {
        const result = await this.adapter.getTaskStatus(taskId, provider);
        if (
          result.status === 'completed' ||
          result.status === 'failed' ||
          result.status === 'cancelled'
        ) {
          return result;
        }
        return undefined;
      },
      POLLING_PRESETS.audio,
      abortSignal,
    );
  }
}
