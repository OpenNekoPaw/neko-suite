import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@neko/shared';
import {
  CUSTOM_NEWAPI_PROVIDER_ID,
  DEFAULT_USER_CONFIG,
  NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_CHAT_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID,
  NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
  NEKO_GATEWAY_PROVIDER_ID,
  OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID,
  OLLAMA_LOCAL_PROVIDER_ID,
} from '../default-config';

describe('default agent provider configuration', () => {
  it('uses NewAPI-compatible gateway and local provider groups by default', () => {
    expect(DEFAULT_USER_CONFIG.defaultProvider).toBe(OLLAMA_LOCAL_PROVIDER_ID);
    expect(DEFAULT_USER_CONFIG.defaultModel).toBe(OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID);
    expect(DEFAULT_CONFIG.defaultProvider).toBe(OLLAMA_LOCAL_PROVIDER_ID);
    expect(DEFAULT_CONFIG.defaultModel).toBe(OLLAMA_LOCAL_DEFAULT_CHAT_MODEL_ID);

    const providers = new Map(
      DEFAULT_USER_CONFIG.providers?.map((provider) => [provider.id, provider]),
    );

    expect(providers.get(NEKO_GATEWAY_PROVIDER_ID)).toMatchObject({
      type: 'newapi',
      connectionKind: 'gateway',
      protocolProfile: 'newapi-compatible',
      supportLevel: 'verified',
      requiresApiKey: true,
    });
    expect(providers.get(CUSTOM_NEWAPI_PROVIDER_ID)).toMatchObject({
      type: 'newapi',
      connectionKind: 'custom-gateway',
      protocolProfile: 'newapi-compatible',
      supportLevel: 'custom',
      enabled: false,
    });
    expect(providers.get(OLLAMA_LOCAL_PROVIDER_ID)).toMatchObject({
      type: 'ollama',
      connectionKind: 'local',
      protocolProfile: 'ollama',
      requiresApiKey: false,
    });
  });

  it('uses canonical model IDs for default media models', () => {
    const models = new Map(DEFAULT_USER_CONFIG.models?.map((model) => [model.id, model]));

    expect(DEFAULT_USER_CONFIG.defaultMediaModels).toEqual({
      image: NEKO_GATEWAY_DEFAULT_IMAGE_MODEL_ID,
      video: NEKO_GATEWAY_DEFAULT_VIDEO_MODEL_ID,
      audio: NEKO_GATEWAY_DEFAULT_AUDIO_MODEL_ID,
      music: NEKO_GATEWAY_DEFAULT_MUSIC_MODEL_ID,
    });

    for (const modelId of Object.values(DEFAULT_USER_CONFIG.defaultMediaModels ?? {})) {
      expect(models.has(modelId)).toBe(true);
    }
  });
});
