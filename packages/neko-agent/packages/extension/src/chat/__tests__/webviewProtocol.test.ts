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

  it('accepts agent-scoped media understanding model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'analyze this video',
        sessionMode: 'agent',
        understandingModels: {
          video: { providerId: 'google', modelId: 'gemini-video-pro', category: 'llm' },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        understandingModels: {
          video: { providerId: 'google', modelId: 'gemini-video-pro', category: 'llm' },
        },
      }),
    );
  });

  it('rejects understanding model refs outside agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'openai', modelId: 'gpt-image', category: 'image' },
        understandingModels: {
          image: { providerId: 'google', modelId: 'gemini-image', category: 'llm' },
        },
      }),
    ).toBeNull();
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

  it('accepts conversation-scoped message queue commands', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'getMessageQueue',
        conversationId: 'conv-1',
      }),
    ).toEqual({ type: 'getMessageQueue', conversationId: 'conv-1' });

    expect(
      parseWebviewToExtensionMessage({
        type: 'promoteQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toEqual({
      type: 'promoteQueuedMessage',
      conversationId: 'conv-1',
      queueItemId: 'queue-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toEqual({
      type: 'cancelQueuedMessage',
      conversationId: 'conv-1',
      queueItemId: 'queue-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'editQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: 'queue-1',
      }),
    ).toEqual({
      type: 'editQueuedMessage',
      conversationId: 'conv-1',
      queueItemId: 'queue-1',
    });
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
    expect(
      parseWebviewToExtensionMessage({
        type: 'getMessageQueue',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'promoteQueuedMessage',
        queueItemId: 'queue-1',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'cancelQueuedMessage',
        conversationId: 'conv-1',
      }),
    ).toBeNull();
  });

  it('accepts creative background conversation lifecycle commands', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'conversationLifecycle',
        conversationId: 'background-1',
        action: 'stop-and-delete',
        commandId: 'command-1',
        expectedState: 'active',
        activeRunIds: ['run-1'],
        reason: 'user-requested-delete',
      }),
    ).toEqual({
      type: 'conversationLifecycle',
      conversationId: 'background-1',
      action: 'stop-and-delete',
      commandId: 'command-1',
      expectedState: 'active',
      activeRunIds: ['run-1'],
      reason: 'user-requested-delete',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'conversationLifecycle',
        conversationId: 'background-1',
        action: 'teleport',
      }),
    ).toBeNull();
  });

  it.each([
    ['confirm tool approvals', { type: 'confirmTool', toolCallId: 'tool-1', approved: true }],
    ['history clearing', { type: 'clearHistory' }],
    ['message cancellation', { type: 'cancelMessage' }],
    ['task refresh', { type: 'getTasks' }],
    ['context token refresh', { type: 'getContextTokenCount' }],
    ['context compression', { type: 'compressContext' }],
    ['prompt mode refresh', { type: 'getPromptMode' }],
    ['active Skill clearing', { type: 'clearActiveSkill', recordId: 'record-1' }],
    ['conversation deletion', { type: 'deleteConversation' }],
    ['conversation lifecycle', { type: 'conversationLifecycle', action: 'archive' }],
    ['queued message promotion', { type: 'promoteQueuedMessage', queueItemId: 'queue-1' }],
    ['queued message cancellation', { type: 'cancelQueuedMessage', queueItemId: 'queue-1' }],
    ['queued message editing', { type: 'editQueuedMessage', queueItemId: 'queue-1' }],
    ['plan approval', { type: 'planApprove', planId: 'plan-1' }],
    ['plan rejection', { type: 'planReject', planId: 'plan-1' }],
    ['plan step approval', { type: 'planStepApprove', planId: 'plan-1', stepId: 'step-1' }],
    ['plan step rejection', { type: 'planStepReject', planId: 'plan-1', stepId: 'step-1' }],
    [
      'plan step modification',
      {
        type: 'planStepModify',
        planId: 'plan-1',
        stepId: 'step-1',
        newDescription: 'Update step',
      },
    ],
    ['task cancellation', { type: 'cancelTask', taskId: 'task-1' }],
    ['task retry', { type: 'retryTask', taskId: 'task-1' }],
    ['task result viewing', { type: 'viewTaskResult', taskId: 'task-1' }],
    ['prompt mode setting', { type: 'setPromptMode', mode: 'plan' }],
    [
      'capability lifecycle invocation',
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'request-1',
        invocation: { capabilityId: 'canvas.createStoryboardFromMarkdown', phase: 'apply' },
      },
    ],
    [
      'canvas authoring handoff',
      {
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'request-1',
        sourceKind: 'generated-text',
        content: 'Create a Canvas scene note.',
      },
    ],
    [
      'Mermaid error feedback',
      {
        type: 'mermaidError',
        error: 'Syntax error',
        code: 'ParseError',
        feedbackMessage: 'Fix the Mermaid diagram.',
      },
    ],
    ['builtin slash command', { type: 'invokeSlashCommand', command: 'clear' }],
    ['Skill invocation', { type: 'invokeSkill', skillName: 'storyboard' }],
    [
      'plugin slash command',
      { type: 'invokePluginSlashCommand', extensionId: 'neko.canvas', commandId: 'batch' },
    ],
  ])('rejects %s without explicit conversation scope', (_name, payload) => {
    expect(parseWebviewToExtensionMessage(payload)).toBeNull();
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

  it('accepts webview keyboard ownership messages without conversation scope', () => {
    expect(parseWebviewToExtensionMessage({ type: 'webviewKeyboardFocus', focused: true })).toEqual(
      {
        type: 'webviewKeyboardFocus',
        focused: true,
      },
    );
    expect(
      parseWebviewToExtensionMessage({ type: 'webviewKeyboardEditable', editable: true }),
    ).toEqual({
      type: 'webviewKeyboardEditable',
      editable: true,
    });
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
