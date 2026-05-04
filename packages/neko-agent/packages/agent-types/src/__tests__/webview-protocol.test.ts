import { describe, expect, it } from 'vitest';
import {
  buildAmbientCanvasUpdateMessage,
  buildAgentPhaseMessage,
  buildAgentStateSnapshotMessage,
  buildAgentStoppedMessage,
  buildErrorMessage,
  buildExternalInputMessage,
  buildHistoryClearedMessage,
  buildInjectContextMessage,
  buildMediaTaskCreatedMessage,
  buildMediaTaskProgressMessage,
  buildMessageCancelledMessage,
  buildPluginCommandsMessage,
  buildPluginSlashCommandInvocation,
  buildPluginsAvailableMessage,
  buildSubAgentEventMessage,
  buildTaskCreatedMessage,
  buildTaskRemovedMessage,
  buildTaskUpdatedMessage,
  buildTasksUpdatedMessage,
  buildThinkingMessage,
  buildToolConfirmationMessage,
  parseSendMessageWebviewMessage,
  parseWebviewToExtensionMessage,
  projectGenerationProgressMessage,
} from '../webview-protocol';

describe('webview protocol parser', () => {
  it('accepts agent-mode multimedia model selections as explicit model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'Generate mixed media',
        sessionMode: 'agent',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        mediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
          audio: { providerId: 'suno', modelId: 'v4', category: 'audio' },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        sessionMode: 'agent',
        mediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
          audio: { providerId: 'suno', modelId: 'v4', category: 'audio' },
        },
      }),
    );
  });

  it('accepts structured context payloads on sendMessage', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'summarize',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected document text',
            data: { selectedText: 'hello' },
          },
        ],
      }),
    ).toMatchObject({
      type: 'sendMessage',
      conversationId: 'conv-1',
      contextPayloads: [
        {
          type: 'document-selection',
          id: 'selection-1',
          label: 'Selection',
          summary: 'Selected document text',
          data: { selectedText: 'hello' },
        },
      ],
    });
  });

  it('rejects malformed structured context payloads', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'summarize',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'unknown-context',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected document text',
            data: {},
          },
        ],
      }),
    ).toBeNull();
  });

  it('rejects sendMessage payloads without explicit conversation scope', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        message: 'hello',
        sessionMode: 'agent',
      }),
    ).toBeNull();
  });

  it('rejects legacy provider/model fields at the shared boundary', () => {
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

  it('rejects mediaModels outside agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        mediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toBeNull();
  });

  it('rejects agent media model selections with mismatched categories', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'Generate mixed media',
        sessionMode: 'agent',
        mediaModels: {
          image: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
        },
      }),
    ).toBeNull();
  });

  it('requires non-agent mediaModel category to match session mode', () => {
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

  it('rejects single mediaModel in agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'agent',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      }),
    ).toBeNull();
  });
});

describe('webview protocol projectors', () => {
  it('projects generation progress using the shared protocol payload', () => {
    expect(
      projectGenerationProgressMessage({
        nodeId: 'node-1',
        taskId: 'task-1',
        status: 'generating',
        count: 1,
        total: 3,
      }),
    ).toEqual({
      type: 'generationProgress',
      progress: {
        nodeId: 'node-1',
        taskId: 'task-1',
        status: 'generating',
        count: 1,
        total: 3,
      },
    });
  });

  it('builds common extension-to-webview bridge messages', () => {
    expect(buildThinkingMessage('conv-1')).toEqual({
      type: 'thinking',
      conversationId: 'conv-1',
    });
    expect(buildErrorMessage({ conversationId: 'conv-1', message: 'Failed' })).toEqual({
      type: 'error',
      conversationId: 'conv-1',
      message: 'Failed',
    });
    expect(buildHistoryClearedMessage('conv-1')).toEqual({
      type: 'historyCleared',
      conversationId: 'conv-1',
    });
    expect(buildMessageCancelledMessage('conv-1')).toEqual({
      type: 'messageCancelled',
      conversationId: 'conv-1',
    });
    expect(buildAgentStoppedMessage('conv-1')).toEqual({
      type: 'agentStopped',
      conversationId: 'conv-1',
    });
    expect(
      buildAgentPhaseMessage({
        conversationId: 'conv-1',
        phase: 'acting',
        toolName: 'Read',
        timestamp: 1777392000000,
      }),
    ).toEqual({
      type: 'agentPhase',
      conversationId: 'conv-1',
      phase: 'acting',
      toolName: 'Read',
      timestamp: 1777392000000,
    });
    expect(
      buildAgentStateSnapshotMessage([
        {
          conversationId: 'conv-1',
          phase: 'acting',
          toolName: 'Read',
          startedAt: 1777392000000,
        },
      ]),
    ).toEqual({
      type: 'agentStateSnapshot',
      agentStates: [
        {
          conversationId: 'conv-1',
          phase: 'acting',
          toolName: 'Read',
          startedAt: 1777392000000,
        },
      ],
    });
    expect(
      buildToolConfirmationMessage({
        conversationId: 'conv-1',
        toolCallId: 'tool-1',
        toolName: 'Write',
        action: 'write',
        description: 'Write file',
        details: { path: 'README.md' },
      }),
    ).toEqual({
      type: 'toolConfirmation',
      conversationId: 'conv-1',
      toolCallId: 'tool-1',
      toolName: 'Write',
      action: 'write',
      description: 'Write file',
      details: { path: 'README.md' },
    });

    expect(
      buildAmbientCanvasUpdateMessage({
        conversationId: 'conv-1',
        nodes: [{ nodeId: 'node-1', type: 'image', summary: 'Selected image' }],
      }),
    ).toEqual({
      type: 'ambientCanvasUpdate',
      conversationId: 'conv-1',
      nodes: [{ nodeId: 'node-1', type: 'image', summary: 'Selected image' }],
    });

    expect(
      buildInjectContextMessage({
        id: 'ctx-1',
        type: 'file',
        label: 'story.md',
        summary: 'File: story.md',
        data: {},
      }),
    ).toEqual({
      type: 'injectContext',
      payload: {
        id: 'ctx-1',
        type: 'file',
        label: 'story.md',
        summary: 'File: story.md',
        data: {},
      },
    });

    expect(
      buildInjectContextMessage(
        {
          id: 'ctx-2',
          type: 'file',
          label: 'scene.md',
          summary: 'File: scene.md',
          data: {},
        },
        { conversationId: 'conv-1' },
      ),
    ).toEqual({
      type: 'injectContext',
      conversationId: 'conv-1',
      payload: {
        id: 'ctx-2',
        type: 'file',
        label: 'scene.md',
        summary: 'File: scene.md',
        data: {},
      },
    });

    expect(buildExternalInputMessage({ message: 'run', autoSend: true })).toEqual({
      type: 'externalMessage',
      message: 'run',
    });
    expect(buildExternalInputMessage({ message: 'draft', autoSend: false })).toEqual({
      type: 'prefillInput',
      message: 'draft',
    });

    expect(
      buildPluginCommandsMessage([
        {
          id: 'batch',
          name: '/batch',
          description: 'Batch generate',
          extensionId: 'neko.nekocanvas',
        },
      ]),
    ).toEqual({
      type: 'pluginCommands',
      commands: [
        {
          id: 'batch',
          name: '/batch',
          description: 'Batch generate',
          extensionId: 'neko.nekocanvas',
        },
      ],
    });
    expect(buildPluginsAvailableMessage({ canvas: true, cut: false })).toEqual({
      type: 'pluginsAvailable',
      plugins: { canvas: true, cut: false },
    });

    expect(
      buildPluginSlashCommandInvocation({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
        conversationId: 'conv-1',
        args: 'scene 1',
      }),
    ).toEqual({
      extensionId: 'neko.canvas',
      commandId: 'batch',
      conversationId: 'conv-1',
      args: 'scene 1',
    });
  });

  it('parses plugin slash commands as conversation-scoped messages', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'invokePluginSlashCommand',
      extensionId: 'neko.canvas',
      commandId: 'batch',
      conversationId: 'conv-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'invokePluginSlashCommand',
        extensionId: 'neko.canvas',
        commandId: 'batch',
      }),
    ).toBeNull();
  });

  it('parses prompt mode controls as conversation-scoped messages', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'setPromptMode',
        conversationId: 'conv-1',
        mode: 'plan',
      }),
    ).toEqual({
      type: 'setPromptMode',
      conversationId: 'conv-1',
      mode: 'plan',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'togglePlanMode',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'togglePlanMode',
      conversationId: 'conv-1',
    });

    expect(parseWebviewToExtensionMessage({ type: 'getPromptMode' })).toBeNull();
    expect(parseWebviewToExtensionMessage({ type: 'setPromptMode', mode: 'plan' })).toBeNull();
  });

  it('builds task, media task, and subagent messages with conversation scope', () => {
    const task = {
      id: 'task-1',
      type: 'image' as const,
      name: 'Generate image',
      prompt: 'cat',
      providerId: 'openai',
      providerName: 'gpt-image',
      status: 'processing' as const,
      progress: 20,
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:01.000Z',
    };
    const subAgentEvent = {
      type: 'started' as const,
      subAgentId: 'sub-1',
      parentAgentId: 'agent-1',
      conversationId: 'conv-1',
      timestamp: 1777392000000,
    };
    const subAgentWorkItem = {
      id: 'sub-1',
      conversationId: 'conv-1',
      kind: 'subagent' as const,
      parentMessageId: null,
      parentToolCallId: null,
      title: 'SubAgent sub-1',
      status: 'processing' as const,
      progress: 5,
      createdAt: new Date(1777392000000).toISOString(),
      updatedAt: new Date(1777392000000).toISOString(),
      subAgent: {
        parentAgentId: 'agent-1',
      },
    };
    const workItem = {
      id: task.id,
      conversationId: 'conv-1',
      kind: 'tool-background-task' as const,
      parentMessageId: null,
      parentToolCallId: null,
      title: task.name,
      summary: task.prompt,
      status: task.status,
      progress: task.progress,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      task,
    };

    expect(buildTasksUpdatedMessage({ conversationId: 'conv-1', workItems: [workItem] })).toEqual({
      type: 'tasksUpdated',
      conversationId: 'conv-1',
      workItems: [workItem],
    });
    expect(
      buildTaskCreatedMessage({
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCallId: 'tool-1',
        workItem,
      }),
    ).toEqual({
      type: 'taskCreated',
      conversationId: 'conv-1',
      messageId: 'msg-1',
      toolCallId: 'tool-1',
      workItem,
    });
    expect(buildTaskUpdatedMessage({ conversationId: 'conv-1', workItem })).toEqual({
      type: 'taskUpdated',
      conversationId: 'conv-1',
      workItem,
    });
    expect(buildTaskRemovedMessage({ conversationId: 'conv-1', taskId: 'task-1' })).toEqual({
      type: 'taskRemoved',
      conversationId: 'conv-1',
      taskId: 'task-1',
    });
    const mediaWorkItem = {
      id: 'media-1',
      conversationId: 'conv-1',
      kind: 'media-task' as const,
      parentMessageId: null,
      parentToolCallId: null,
      title: 'cat',
      summary: 'cat',
      status: 'processing' as const,
      progress: 10,
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:01.000Z',
      task: {
        id: 'media-1',
        type: 'image' as const,
        name: 'cat',
        prompt: 'cat',
        providerId: 'openai',
        providerName: 'gpt-image',
        status: 'processing' as const,
        progress: 10,
        createdAt: '2026-04-29T00:00:00.000Z',
        updatedAt: '2026-04-29T00:00:01.000Z',
      },
    };

    expect(
      buildMediaTaskCreatedMessage({ conversationId: 'conv-1', workItem: mediaWorkItem }),
    ).toEqual({
      type: 'mediaTaskCreated',
      conversationId: 'conv-1',
      workItem: mediaWorkItem,
    });
    expect(
      buildMediaTaskProgressMessage({ conversationId: 'conv-1', workItem: mediaWorkItem }),
    ).toEqual({
      type: 'mediaTaskProgress',
      conversationId: 'conv-1',
      workItem: mediaWorkItem,
    });
    expect(
      buildSubAgentEventMessage({
        event: subAgentEvent,
        workItem: subAgentWorkItem,
      }),
    ).toEqual({
      type: 'subagentEvent',
      conversationId: 'conv-1',
      event: subAgentEvent,
      workItem: subAgentWorkItem,
    });
  });
});
