import { describe, expect, it } from 'vitest';
import { parseSendMessageWebviewMessage, parseWebviewToExtensionMessage } from '@neko-agent/types';

describe('parseSendMessageWebviewMessage', () => {
  it('accepts explicit conversation and model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        mediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      }),
    );
  });

  it('rejects missing conversationId', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        message: 'hello',
        sessionMode: 'agent',
      }),
    ).toBeNull();
  });

  it('rejects legacy top-level providerId/modelId shape', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        providerId: 'openai',
        modelId: 'gpt-4.1',
      }),
    ).toBeNull();
  });

  it('requires mediaModel category to match non-agent sessionMode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      }),
    ).toBeNull();
  });
});

describe('parseWebviewToExtensionMessage', () => {
  it('delegates valid sendMessage payloads to the explicit model-ref parser', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      }),
    );
  });

  it('rejects legacy sendMessage provider/model fields at the shared boundary', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        providerId: 'openai',
        modelId: 'gpt-4.1',
      }),
    ).toBeNull();
  });

  it('accepts conversation-scoped task actions', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelTask',
        taskId: 'task-1',
        conversationId: 'conv-1',
      }),
    ).toEqual({ type: 'cancelTask', taskId: 'task-1', conversationId: 'conv-1' });
  });

  it('accepts conversation-scoped plugin slash commands', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
        conversationId: 'conv-1',
        args: 'scene 1',
      }),
    ).toEqual({
      type: 'invokePluginSlashCommand',
      extensionId: 'neko.canvas',
      commandId: 'batch',
      conversationId: 'conv-1',
      args: 'scene 1',
    });
  });

  it('rejects conversation-bound messages without conversationId', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelTask',
        taskId: 'task-1',
      }),
    ).toBeNull();
  });

  it('rejects plugin slash commands without conversationId', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
      }),
    ).toBeNull();
  });

  it('accepts tab state updates with explicit tab-to-conversation mapping', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'updateTabState',
        openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
        activeTabId: 'tab-1',
      }),
    ).toEqual({
      type: 'updateTabState',
      openTabs: [{ id: 'tab-1', title: 'Chat', conversationId: 'conv-1' }],
      activeTabId: 'tab-1',
    });
  });
});
