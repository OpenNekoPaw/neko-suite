import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@neko/agent';
import {
  assertStreamedText,
  createAgentEventRecorder,
  createPlatformHarness,
  resolveAgentRealApiProfile,
} from '@neko-agent/test-utils/real-api';

describe('Platform real API smoke harness', () => {
  it('fails visibly when explicit real config.toml is missing', () => {
    expect(() =>
      resolveAgentRealApiProfile({
        env: { NEKO_AGENT_REAL_API: '1' },
      }),
    ).toThrow('requires NEKO_AGENT_TEST_CONFIG to point at config.toml');
  });

  it('runs mock profile without real provider configuration', async () => {
    const profile = resolveAgentRealApiProfile({ env: {} });
    const harness = createPlatformHarness({
      profile,
      toolRegistry: new ToolRegistry(),
    });

    const stream = harness.service.chatStream([{ role: 'user', content: 'Say mock platform ok.' }]);
    const recorder = createAgentEventRecorder(profile);
    for await (const chunk of stream) {
      if (chunk.content) recorder.record({ type: 'text_delta', content: chunk.content });
      if (chunk.type === 'done') recorder.record({ type: 'done' });
    }
    const evidence = recorder.finish({
      providerId: harness.providerId,
      modelId: harness.modelId,
    });

    assertStreamedText(evidence);
    expect(evidence.text).toContain('mock platform ok');
    harness.dispose();
  });

  it('calls real chat and chatStream for explicit real profiles', async () => {
    const profile = resolveAgentRealApiProfile({ requireConfig: true });
    if (profile.profile === 'mock') {
      throw new Error('Platform real API smoke requires a non-mock profile');
    }
    const harness = createPlatformHarness({
      profile,
      toolRegistry: new ToolRegistry(),
    });

    try {
      const chat = await harness.service.chat(
        [{ role: 'user', content: 'Reply with the single word: neko' }],
        {
          ...(harness.providerId ? { providerId: harness.providerId } : {}),
          ...(harness.modelId ? { modelId: harness.modelId } : {}),
          maxTokens: 64,
        },
      );
      const chatText =
        typeof chat.message.content === 'string'
          ? chat.message.content
          : JSON.stringify(chat.message.content);
      expect(chatText.trim().length).toBeGreaterThan(0);

      let streamed = '';
      for await (const chunk of harness.service.chatStream(
        [{ role: 'user', content: 'Reply with the single word: stream' }],
        {
          ...(harness.providerId ? { providerId: harness.providerId } : {}),
          ...(harness.modelId ? { modelId: harness.modelId } : {}),
          maxTokens: 64,
        },
      )) {
        if (chunk.content) streamed += chunk.content;
      }
      expect(streamed.trim().length).toBeGreaterThan(0);
    } finally {
      harness.dispose();
    }
  }, 120_000);
});
