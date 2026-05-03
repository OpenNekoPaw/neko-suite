import { describe, expect, it } from 'vitest';
import {
  createConversationPromptModeRuntime,
  runSendConversationPromptModeRuntime,
  runSetConversationPromptModeRuntime,
  runToggleConversationPromptModeRuntime,
} from '../conversation-prompt-mode-runtime';

describe('ConversationPromptModeRuntime', () => {
  it('isolates prompt mode per conversation', () => {
    const runtime = createConversationPromptModeRuntime();

    expect(runtime.getMode('conv-a')).toBe('default');
    expect(runtime.setMode('conv-a', 'plan')).toEqual({
      conversationId: 'conv-a',
      mode: 'plan',
      isPlanMode: true,
    });

    expect(runtime.getMode('conv-a')).toBe('plan');
    expect(runtime.getMode('conv-b')).toBe('default');
    expect(runtime.isPlanMode('conv-b')).toBe(false);
  });

  it('toggles and clears a single conversation without affecting others', () => {
    const runtime = createConversationPromptModeRuntime();

    runtime.setMode('conv-a', 'plan');
    runtime.setMode('conv-b', 'plan');

    expect(runtime.togglePlanMode('conv-a')).toEqual({
      conversationId: 'conv-a',
      mode: 'default',
      isPlanMode: false,
    });
    expect(runtime.getMode('conv-b')).toBe('plan');

    runtime.clear('conv-b');
    expect(runtime.getMode('conv-b')).toBe('default');
  });

  it('posts prompt mode changes through the runtime message boundary', async () => {
    const runtime = createConversationPromptModeRuntime();
    const messages: unknown[] = [];

    await expect(
      runSetConversationPromptModeRuntime({ conversationId: 'conv-a', mode: 'plan' }, runtime, {
        postMessage: (message) => messages.push(message),
      }),
    ).resolves.toEqual({
      conversationId: 'conv-a',
      snapshot: {
        conversationId: 'conv-a',
        mode: 'plan',
        isPlanMode: true,
      },
      message: {
        type: 'promptModeChanged',
        conversationId: 'conv-a',
        mode: 'plan',
        isPlanMode: true,
      },
    });

    await runToggleConversationPromptModeRuntime({ conversationId: 'conv-a' }, runtime, {
      postMessage: (message) => messages.push(message),
    });
    await runSendConversationPromptModeRuntime({ conversationId: 'conv-a' }, runtime, {
      postMessage: (message) => messages.push(message),
    });

    expect(messages).toEqual([
      {
        type: 'promptModeChanged',
        conversationId: 'conv-a',
        mode: 'plan',
        isPlanMode: true,
      },
      {
        type: 'promptModeChanged',
        conversationId: 'conv-a',
        mode: 'default',
        isPlanMode: false,
      },
      {
        type: 'promptModeChanged',
        conversationId: 'conv-a',
        mode: 'default',
        isPlanMode: false,
      },
    ]);
  });
});
