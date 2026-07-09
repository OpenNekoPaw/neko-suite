import React from 'react';
import { render } from 'ink-testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_CLI_CONFIG } from '../../core/types';
import { useAgentStore } from '../../stores/agent-store';
import { useConfigStore } from '../../stores/config-store';
import { StatusBar } from './StatusBar';

const originalNekoLocale = process.env.NEKO_LOCALE;

afterEach(() => {
  if (originalNekoLocale === undefined) {
    delete process.env.NEKO_LOCALE;
  } else {
    process.env.NEKO_LOCALE = originalNekoLocale;
  }
  useAgentStore.getState().reset();
});

describe('StatusBar i18n', () => {
  it('uses Chinese chrome labels when TUI locale is zh', () => {
    process.env.NEKO_LOCALE = 'zh-CN';
    useConfigStore.getState().replaceConfig({
      ...DEFAULT_CLI_CONFIG,
      provider: 'nekoapi-chat',
      providerType: 'newapi',
      providerRequiresApiKey: true,
      model: 'gpt-5.5',
      chatModel: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
      defaultMediaModels: {
        image: 'nekoapi-media:gpt-image-2',
      },
    });

    const { lastFrame } = render(<StatusBar />);

    expect(lastFrame()).toContain('助理:自动');
    expect(lastFrame()).toContain('对话:');
    expect(lastFrame()).toContain('媒体:图像:');
  });

  it('uses the live context token estimate instead of completed provider usage', () => {
    process.env.NEKO_LOCALE = 'en-US';
    useConfigStore.getState().replaceConfig({
      ...DEFAULT_CLI_CONFIG,
      provider: 'nekoapi-chat',
      providerType: 'newapi',
      providerRequiresApiKey: true,
      model: 'gpt-5.5',
      chatModel: {
        providerId: 'nekoapi-chat',
        modelId: 'gpt-5.5',
        contextWindow: 256000,
        maxOutputTokens: 128000,
      },
      maxTokens: 8192,
    });
    useAgentStore.getState().updateUsage({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    });
    useAgentStore.getState().setContextTokenCount(12345);

    const { lastFrame } = render(<StatusBar />);

    expect(lastFrame()).toContain('ctx:12.3K/384.0K');
    expect(lastFrame()).not.toContain('ctx:0/384.0K');
  });
});
