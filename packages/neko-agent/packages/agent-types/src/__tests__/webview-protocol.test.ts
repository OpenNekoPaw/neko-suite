import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  buildAmbientCanvasUpdateMessage,
  buildAgentPhaseMessage,
  buildAgentCapabilityActivationProgressMessage,
  buildAgentSessionDiagnosticMessage,
  buildAgentStateSnapshotMessage,
  buildAgentTurnTimelineMessage,
  buildErrorMessage,
  buildExternalInputMessage,
  buildHistoryClearedMessage,
  buildInjectContextMessage,
  buildMediaTaskCreatedMessage,
  buildMediaTaskProgressMessage,
  buildMessageCancelledMessage,
  buildMessageQueueErrorMessage,
  buildMessageQueueSnapshotMessage,
  buildQueuedMessageEditRequestedMessage,
  buildPluginCommandsMessage,
  buildPluginSlashCommandInvocation,
  buildPluginsAvailableMessage,
  buildStreamTextMessage,
  buildSubAgentEventMessage,
  buildTaskCreatedMessage,
  buildTaskRemovedMessage,
  buildTaskUpdatedMessage,
  buildTasksUpdatedMessage,
  buildThinkingMessage,
  buildToolConfirmationMessage,
  parseSendMessageWebviewMessage,
  parseWebviewToExtensionMessage,
  validateAgentTurnTimelineMessage,
} from '../webview-protocol';
import type { MessageQueuedMessage } from '../webview-protocol';
import type { AgentTurnTimelineItem } from '../agent-turn-timeline';

const cacheResourceRef = createResourceRef({
  scope: 'project',
  provider: 'document-archive',
  kind: 'document',
  source: {
    kind: 'document',
    document: { filePath: '/books/a.epub', format: 'epub' },
    filePath: '/books/a.epub',
  },
  locator: { kind: 'document', entryPath: 'models/character.glb' },
  fingerprint: createResourceFingerprint({
    strategy: 'provider',
    value: 'book-a:character',
    providerId: 'document-archive',
  }),
});

describe('webview protocol parser', () => {
  it('builds valid agent turn timeline event batches', () => {
    const textItem = makeTimelineTextItem({
      itemId: 'text-1',
      sequence: 1,
      content: 'I will inspect the file.',
    });
    const toolItem = makeTimelineToolItem({
      itemId: 'tool-item-1',
      sequence: 2,
      toolCallId: 'tool-1',
    });
    const taskItem = makeTimelineTaskItem({
      itemId: 'task-item-1',
      sequence: 3,
      parentToolCallId: 'tool-1',
    });

    expect(
      buildAgentTurnTimelineMessage({
        conversationId: 'conv-1',
        turnId: 'turn-1',
        messageId: 'msg-1',
        events: [textItem, toolItem, taskItem],
      }),
    ).toEqual({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [textItem, toolItem, taskItem],
    });
    expect(
      validateAgentTurnTimelineMessage({
        type: 'agentTurnTimeline',
        conversationId: 'conv-1',
        turnId: 'turn-1',
        messageId: 'msg-1',
        events: [textItem, toolItem, taskItem],
      }),
    ).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects invalid agent turn timeline events visibly', () => {
    const result = validateAgentTurnTimelineMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [
        {
          ...makeTimelineTextItem({
            itemId: '',
            sequence: -1,
            content: 'bad',
          }),
          kind: 'unknown',
          status: 'paused',
          payload: {},
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'missing-item-id',
        'invalid-sequence',
        'invalid-kind',
        'invalid-status',
      ]),
    );
  });

  it('rejects duplicate timeline item ids for different items', () => {
    const result = validateAgentTurnTimelineMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [
        makeTimelineTextItem({ itemId: 'item-1', sequence: 1, content: 'first' }),
        makeTimelineToolItem({ itemId: 'item-1', sequence: 2, toolCallId: 'tool-1' }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicate-item-id',
          itemId: 'item-1',
        }),
      ]),
    );
  });

  it('rejects parentless task and media events unless they are explicitly turn scoped', () => {
    const missingParent = validateAgentTurnTimelineMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [makeParentlessTimelineTaskFixture({ itemId: 'task-1', sequence: 1 })],
    });
    const explicitParentless = validateAgentTurnTimelineMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [
        {
          ...makeParentlessTimelineTaskFixture({ itemId: 'task-1', sequence: 1 }),
          parentAnchor: 'turn',
        },
      ],
    });

    expect(missingParent.ok).toBe(false);
    expect(missingParent.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing-parent-anchor',
          itemId: 'task-1',
        }),
      ]),
    );
    expect(explicitParentless).toEqual({ ok: true, diagnostics: [] });
  });

  it('rejects non-monotonic timeline event batches', () => {
    const result = validateAgentTurnTimelineMessage({
      type: 'agentTurnTimeline',
      conversationId: 'conv-1',
      turnId: 'turn-1',
      messageId: 'msg-1',
      events: [
        makeTimelineTextItem({ itemId: 'text-2', sequence: 2, content: 'second' }),
        makeTimelineToolItem({ itemId: 'tool-1', sequence: 1, toolCallId: 'tool-1' }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'non-monotonic-sequence',
          sequence: 1,
        }),
      ]),
    );
  });

  it('accepts tabless project search purposes and rejects unknown search purposes', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: '',
        purpose: 'roleplay',
      }),
    ).toEqual({
      type: 'searchProjectFiles',
      filter: '',
      purpose: 'roleplay',
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: 'hero',
        purpose: 'entry',
      }),
    ).toEqual({
      type: 'searchProjectFiles',
      filter: 'hero',
      purpose: 'entry',
    });
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: '',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'searchProjectFiles',
        filter: '',
        conversationId: 'conv-1',
        purpose: 'unknown',
      }),
    ).toBeNull();
  });

  it('accepts starting Character Dialogue from slash args without conversation scope', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'startCharacterDialogueFromSlash',
        args: 'entity:char-xiaoju --roleplay',
      }),
    ).toEqual({
      type: 'startCharacterDialogueFromSlash',
      args: 'entity:char-xiaoju --roleplay',
    });
  });

  it('accepts message queue commands with explicit conversation and item scope', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'getMessageQueue',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'getMessageQueue',
      conversationId: 'conv-1',
    });

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

  it('preserves optional displayed result refs on task view actions', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'viewTaskResult',
        conversationId: 'conv-1',
        taskId: 'task-1',
        resultRef: 'generated-assets/asset-1.png',
      }),
    ).toEqual({
      type: 'viewTaskResult',
      conversationId: 'conv-1',
      taskId: 'task-1',
      resultRef: 'generated-assets/asset-1.png',
    });
  });

  it('rejects message queue commands without required explicit scope', () => {
    expect(parseWebviewToExtensionMessage({ type: 'getMessageQueue' })).toBeNull();
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
    expect(
      parseWebviewToExtensionMessage({
        type: 'editQueuedMessage',
        conversationId: 'conv-1',
        queueItemId: '',
      }),
    ).toBeNull();
  });

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

  it('accepts agent model slots and normalized LLM config for agent messages', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'develop the opening scene',
        sessionMode: 'agent',
        agentModels: {
          primary: { providerId: 'openai', modelId: 'gpt-5.5', category: 'llm' },
          deep: { providerId: 'openai', modelId: 'gpt-5.5-pro', category: 'llm' },
        },
        llmConfig: {
          reasoningPreset: 'balanced',
          verbosityPreset: 'standard',
          creativityPreset: 'creative',
          advanced: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 4096,
            reasoningEffort: 'medium',
            thinkingBudget: 2048,
            verbosity: 'medium',
            serviceTier: 'default',
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        sessionMode: 'agent',
        agentModels: {
          primary: { providerId: 'openai', modelId: 'gpt-5.5', category: 'llm' },
          deep: { providerId: 'openai', modelId: 'gpt-5.5-pro', category: 'llm' },
        },
        llmConfig: {
          reasoningPreset: 'balanced',
          verbosityPreset: 'standard',
          creativityPreset: 'creative',
          advanced: {
            temperature: 0.7,
            topP: 0.9,
            maxOutputTokens: 4096,
            reasoningEffort: 'medium',
            thinkingBudget: 2048,
            verbosity: 'medium',
            serviceTier: 'default',
          },
        },
      }),
    );
  });

  it('rejects unknown agent model slots and non-LLM slot refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        agentModels: {
          judge: { providerId: 'openai', modelId: 'gpt-5.5', category: 'llm' },
        },
      }),
    ).toBeNull();

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        agentModels: {
          primary: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toBeNull();
  });

  it('rejects invalid agent LLM config preset and advanced values', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        llmConfig: { reasoningPreset: 'maximum' },
      }),
    ).toBeNull();

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        llmConfig: { advanced: { maxOutputTokens: -1 } },
      }),
    ).toBeNull();
  });

  it('rejects agent LLM config payloads outside agent mode', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'draw',
        sessionMode: 'image',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        llmConfig: { reasoningPreset: 'fast' },
      }),
    ).toBeNull();
  });

  it('rejects legacy raw LLM parameter fields at the sendMessage boundary', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'hello',
        sessionMode: 'agent',
        temperature: 0.7,
      }),
    ).toBeNull();
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

  it('rejects top-level music session mode and model category', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'compose',
        sessionMode: 'music',
        mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'music' },
      }),
    ).toBeNull();

    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'Generate mixed media',
        sessionMode: 'agent',
        mediaModels: {
          audio: { providerId: 'suno', modelId: 'chirp', category: 'music' },
        },
      }),
    ).toBeNull();
  });

  it('accepts music-capable audio models as audio media model refs', () => {
    expect(
      parseSendMessageWebviewMessage({
        type: 'sendMessage',
        conversationId: 'conv-1',
        message: 'compose',
        sessionMode: 'audio',
        mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendMessage',
        conversationId: 'conv-1',
        sessionMode: 'audio',
        mediaModel: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      }),
    );
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

  it('accepts Embody Character tabs only with session projections', () => {
    const openTabs = [
      {
        id: 'tab-embody',
        title: 'Embody: 小橘',
        conversationId: 'embody-session-1',
        kind: 'embody-character' as const,
        embodyCharacterSession: {
          sessionId: 'embody-session-1',
          entityId: 'char-xiaoju',
          displayName: '小橘',
          profile: {
            entityRef: {
              entityId: 'char-xiaoju',
              entityKind: 'character' as const,
              projectRoot: '/workspace',
              source: 'neko-entity',
            },
            displayName: '小橘',
            aliases: [],
            facts: [],
            sparsity: 'thin' as const,
          },
          scopeSummary: ['project: current project'],
          summary: 'User embodies 小橘.',
          startedAt: '2026-06-02T00:00:00.000Z',
          status: 'active' as const,
        },
      },
    ];

    expect(
      parseWebviewToExtensionMessage({
        type: 'updateTabState',
        openTabs,
        activeTabId: 'tab-embody',
      }),
    ).toEqual({
      type: 'updateTabState',
      openTabs: [
        expect.objectContaining({
          kind: 'embody-character',
          embodyCharacterSession: expect.objectContaining({ sessionId: 'embody-session-1' }),
        }),
      ],
      activeTabId: 'tab-embody',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'updateTabState',
        openTabs: [
          {
            id: 'tab-embody',
            title: 'Embody: 小橘',
            conversationId: 'embody-session-1',
            kind: 'embody-character',
            embodyCharacterContext: {
              contextId: 'legacy-hidden-context',
            },
          },
        ],
        activeTabId: 'tab-embody',
      }),
    ).toEqual({
      type: 'updateTabState',
      openTabs: [
        {
          id: 'tab-embody',
          title: 'Embody: 小橘',
          conversationId: 'embody-session-1',
          kind: 'embody-character',
        },
      ],
      activeTabId: 'tab-embody',
    });
  });
});

function makeTimelineTextItem(input: {
  itemId: string;
  sequence: number;
  content: string;
}): AgentTurnTimelineItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId: input.itemId,
    sequence: input.sequence,
    kind: 'assistant_text',
    status: 'streaming',
    payload: {
      content: input.content,
      format: 'markdown',
    },
    createdAt: 1777392000000 + input.sequence,
    updatedAt: 1777392000000 + input.sequence,
  };
}

function makeTimelineToolItem(input: {
  itemId: string;
  sequence: number;
  toolCallId: string;
}): AgentTurnTimelineItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId: input.itemId,
    sequence: input.sequence,
    kind: 'tool_call',
    status: 'pending',
    payload: {
      toolCall: {
        id: input.toolCallId,
        name: 'ReadDocument',
        arguments: { path: '${A}/book.epub' },
      },
    },
    createdAt: 1777392000000 + input.sequence,
    updatedAt: 1777392000000 + input.sequence,
  };
}

function makeTimelineTaskItem(input: {
  itemId: string;
  sequence: number;
  parentToolCallId: string;
}): AgentTurnTimelineItem {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId: input.itemId,
    sequence: input.sequence,
    kind: 'task',
    status: 'pending',
    parentAnchor: 'tool_call',
    parentToolCallId: input.parentToolCallId,
    payload: {
      workItem: {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'msg-1',
        parentToolCallId: input.parentToolCallId,
        title: 'Read document',
        status: 'processing',
        progress: 10,
        createdAt: '2026-04-29T00:00:00.000Z',
        updatedAt: '2026-04-29T00:00:01.000Z',
        task: {
          id: 'task-1',
          type: 'image',
          name: 'Read document',
          prompt: 'Read document',
          providerId: 'local',
          providerName: 'Neko',
          status: 'processing',
          progress: 10,
          createdAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:01.000Z',
        },
      },
    },
    createdAt: 1777392000000 + input.sequence,
    updatedAt: 1777392000000 + input.sequence,
  };
}

function makeParentlessTimelineTaskFixture(input: {
  itemId: string;
  sequence: number;
}): Omit<AgentTurnTimelineItem, 'parentAnchor' | 'parentItemId' | 'parentToolCallId'> {
  return {
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    itemId: input.itemId,
    sequence: input.sequence,
    kind: 'task',
    status: 'pending',
    payload: {
      workItem: {
        id: 'task-1',
        conversationId: 'conv-1',
        kind: 'tool-background-task',
        parentMessageId: 'msg-1',
        parentToolCallId: null,
        title: 'Read document',
        status: 'processing',
        progress: 10,
        createdAt: '2026-04-29T00:00:00.000Z',
        updatedAt: '2026-04-29T00:00:01.000Z',
        task: {
          id: 'task-1',
          type: 'image',
          name: 'Read document',
          prompt: 'Read document',
          providerId: 'local',
          providerName: 'Neko',
          status: 'processing',
          progress: 10,
          createdAt: '2026-04-29T00:00:00.000Z',
          updatedAt: '2026-04-29T00:00:01.000Z',
        },
      },
    },
    createdAt: 1777392000000 + input.sequence,
    updatedAt: 1777392000000 + input.sequence,
  };
}

describe('webview protocol projectors', () => {
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
    const queueItem = {
      id: 'queue-1',
      conversationId: 'conv-1',
      content: '继续分析',
      createdAt: 1777392000000,
      source: 'composer' as const,
    };
    const queueSnapshot = {
      conversationId: 'conv-1',
      pendingCount: 1,
      version: 3,
      items: [queueItem],
    };
    expect(buildMessageQueueSnapshotMessage(queueSnapshot)).toEqual({
      type: 'messageQueueSnapshot',
      snapshot: queueSnapshot,
    });
    const releasedMessageQueued: MessageQueuedMessage = {
      type: 'messageQueued',
      conversationId: 'conv-1',
      pendingCount: 0,
      releasedItem: queueItem,
      snapshot: { ...queueSnapshot, pendingCount: 0, version: 4, items: [] },
    };
    expect(releasedMessageQueued).toEqual({
      type: 'messageQueued',
      conversationId: 'conv-1',
      pendingCount: 0,
      releasedItem: queueItem,
      snapshot: { conversationId: 'conv-1', pendingCount: 0, version: 4, items: [] },
    });
    expect(
      buildQueuedMessageEditRequestedMessage({
        conversationId: 'conv-1',
        item: queueItem,
        snapshot: { ...queueSnapshot, pendingCount: 0, version: 4, items: [] },
      }),
    ).toEqual({
      type: 'queuedMessageEditRequested',
      conversationId: 'conv-1',
      item: queueItem,
      snapshot: { conversationId: 'conv-1', pendingCount: 0, version: 4, items: [] },
    });
    expect(
      buildMessageQueueErrorMessage({
        conversationId: 'conv-1',
        code: 'stale-item',
        message: 'Queued message is no longer pending.',
        queueItemId: 'queue-1',
        snapshot: queueSnapshot,
      }),
    ).toEqual({
      type: 'messageQueueError',
      conversationId: 'conv-1',
      code: 'stale-item',
      message: 'Queued message is no longer pending.',
      queueItemId: 'queue-1',
      snapshot: queueSnapshot,
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
    expect(() =>
      buildAgentStateSnapshotMessage([
        {
          phase: 'acting',
          toolName: 'Read',
          startedAt: 1777392000000,
        } as never,
      ]),
    ).toThrow('agentStateSnapshot requires non-empty conversationId');
    expect(() => buildThinkingMessage('')).toThrow('thinking requires non-empty conversationId');
    expect(() =>
      buildStreamTextMessage({ conversationId: ' ', content: 'stream' }),
    ).toThrow('streamText requires non-empty conversationId');
    expect(() =>
      buildMessageQueueSnapshotMessage({
        conversationId: '',
        pendingCount: 0,
        version: 1,
        items: [],
      }),
    ).toThrow('messageQueueSnapshot requires non-empty conversationId');
    expect(() =>
      buildQueuedMessageEditRequestedMessage({
        conversationId: 'conv-1',
        item: { ...queueItem, conversationId: 'conv-2' },
        snapshot: queueSnapshot,
      }),
    ).toThrow('queuedMessageEditRequested item conversationId must match conversationId');
    expect(() => buildTasksUpdatedMessage({ conversationId: '', workItems: [] })).toThrow(
      'tasksUpdated requires non-empty conversationId',
    );
    expect(() =>
      buildAgentCapabilityActivationProgressMessage({ conversationId: ' ', events: [] }),
    ).toThrow('agentCapabilityActivationProgress requires non-empty conversationId');
    expect(
      buildAgentSessionDiagnosticMessage({
        code: 'active-tab-mismatch',
        message: 'Active tab is switching.',
        conversationId: 'conv-b',
        activeConversationId: 'conv-a',
        activeTabConversationId: 'conv-b',
      }),
    ).toEqual({
      type: 'sessionDiagnostic',
      code: 'active-tab-mismatch',
      severity: 'error',
      message: 'Active tab is switching.',
      conversationId: 'conv-b',
      activeConversationId: 'conv-a',
      activeTabConversationId: 'conv-b',
    });
    expect(() =>
      buildAgentSessionDiagnosticMessage({
        code: 'missing-session-identity',
        message: '',
      }),
    ).toThrow('sessionDiagnostic requires non-empty message');
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
          extensionId: 'neko.neko-canvas',
        },
      ]),
    ).toEqual({
      type: 'pluginCommands',
      commands: [
        {
          id: 'batch',
          name: '/batch',
          description: 'Batch generate',
          extensionId: 'neko.neko-canvas',
        },
      ],
    });
    expect(buildPluginsAvailableMessage({ canvas: true, cut: false, model: true })).toEqual({
      type: 'pluginsAvailable',
      plugins: { canvas: true, cut: false, model: true },
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

  it('parses explicit skill invocation as a conversation-scoped message', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokeSkill',
        skillName: 'quality-review',
        conversationId: 'conv-1',
        args: 'changed files',
      }),
    ).toEqual({
      type: 'invokeSkill',
      skillName: 'quality-review',
      conversationId: 'conv-1',
      args: 'changed files',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'invokeSkill',
        skillName: 'quality-review',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'invokeSkill',
      skillName: 'quality-review',
      conversationId: 'conv-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'invokeSkill',
        skillName: 'quality-review',
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'invokeSkill',
        skillName: 'quality-review',
        conversationId: 'conv-1',
        args: ['changed files'],
      }),
    ).toBeNull();
  });

  it('validates reveal context source contextType against the agent context union', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'revealContextSource',
        contextType: 'canvas-node',
        contextId: 'node-1',
      }),
    ).toEqual({
      type: 'revealContextSource',
      contextType: 'canvas-node',
      contextId: 'node-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'revealContextSource',
        contextType: 'unknown-context',
        contextId: 'node-1',
      }),
    ).toBeNull();
  });

  it('parses document locator reveal messages', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'revealDocumentLocator',
        filePath: '/books/a.epub',
        source: { filePath: '/books/a.epub', format: 'epub' },
        locator: {
          kind: 'chapter',
          chapterHref: 'Page_1',
          spineIndex: 1,
        },
      }),
    ).toEqual({
      type: 'revealDocumentLocator',
      filePath: '/books/a.epub',
      source: { filePath: '/books/a.epub', format: 'epub' },
      locator: {
        kind: 'chapter',
        chapterHref: 'Page_1',
        spineIndex: 1,
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'revealDocumentLocator',
        filePath: '/books/a.epub',
        locator: { kind: 'chapter' },
      }),
    ).toBeNull();
  });

  it('parses asset reveal messages', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'revealAsset',
        assetId: 'asset-1',
      }),
    ).toEqual({
      type: 'revealAsset',
      assetId: 'asset-1',
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'revealAsset',
        assetId: '',
      }),
    ).toBeNull();
  });

  it('parses structured send-to-plugin payloads', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'assetBatch',
          assets: [
            { path: '/repo/a.png', mediaType: 'image', name: 'A' },
            { path: '/repo/b.wav', mediaType: 'audio' },
          ],
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'cut',
      payload: {
        kind: 'assetBatch',
        assets: [
          { path: '/repo/a.png', mediaType: 'image', name: 'A' },
          { path: '/repo/b.wav', mediaType: 'audio' },
        ],
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard: {
            projectName: 'Opening',
            shots: [
              {
                id: 'shot-1',
                shotNumber: 1,
                duration: 3,
                imageDataUrl: 'data:image/png;base64,AAAA',
                label: '#001',
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'cut',
      payload: {
        kind: 'cutStoryboard',
        storyboard: {
          projectName: 'Opening',
          shots: [
            {
              id: 'shot-1',
              shotNumber: 1,
              duration: 3,
              imageDataUrl: 'data:image/png;base64,AAAA',
              label: '#001',
            },
          ],
        },
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard: {
            projectName: 'Opening',
            shots: [
              {
                id: 'shot-1',
                shotNumber: 1,
                duration: 3,
                imageDataUrl: 'data:image/png;base64,AAAA',
                label: '#001',
                textCues: [
                  {
                    cueId: 'text-1',
                    kind: 'dialogue',
                    text: 'Run!',
                    speakerName: 'Rin',
                    speakerCharacterId: 'char-rin',
                    speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
                    confidence: 0.85,
                  },
                  {
                    cueId: 'text-2',
                    kind: 'backgroundText',
                    text: 'EXIT',
                  },
                ],
                voiceCues: [
                  {
                    cueId: 'voice-1',
                    kind: 'dialogue',
                    text: 'Run!',
                    speakerName: 'Rin',
                    speakerCharacterId: 'char-rin',
                    speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
                  },
                ],
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'cut',
      payload: {
        kind: 'cutStoryboard',
        storyboard: {
          projectName: 'Opening',
          shots: [
            {
              id: 'shot-1',
              shotNumber: 1,
              duration: 3,
              imageDataUrl: 'data:image/png;base64,AAAA',
              label: '#001',
              textCues: [
                {
                  cueId: 'text-1',
                  kind: 'dialogue',
                  text: 'Run!',
                  speakerName: 'Rin',
                  speakerCharacterId: 'char-rin',
                  speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
                  confidence: 0.85,
                },
                {
                  cueId: 'text-2',
                  kind: 'backgroundText',
                  text: 'EXIT',
                },
              ],
              voiceCues: [
                {
                  cueId: 'voice-1',
                  kind: 'dialogue',
                  text: 'Run!',
                  speakerName: 'Rin',
                  speakerCharacterId: 'char-rin',
                  speakerEntityRef: { entityId: 'char-rin', entityKind: 'character' },
                },
              ],
            },
          ],
        },
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'model',
        payload: {
          kind: 'singleAsset',
          asset: {
            path: '/repo/character.glb',
            mediaType: 'model',
            name: 'Character',
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'models/character.glb',
              versionPolicy: 'versioned-export',
            },
            resourceRef: cacheResourceRef,
          },
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'model',
      payload: {
        kind: 'singleAsset',
        asset: {
          path: '/repo/character.glb',
          mediaType: 'model',
          name: 'Character',
          documentResourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/a.epub', format: 'epub' },
            entryPath: 'models/character.glb',
            versionPolicy: 'versioned-export',
          },
          resourceRef: cacheResourceRef,
        },
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'singleAsset',
          asset: {
            mediaType: 'image',
            name: 'page-1.jpg',
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'images/page-1.jpg',
              versionPolicy: 'versioned-export',
            },
            resourceRef: cacheResourceRef,
          },
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'canvas',
      payload: {
        kind: 'singleAsset',
        asset: {
          mediaType: 'image',
          name: 'page-1.jpg',
          documentResourceRef: {
            kind: 'document-entry',
            source: { filePath: '/books/a.epub', format: 'epub' },
            entryPath: 'images/page-1.jpg',
            versionPolicy: 'versioned-export',
          },
          resourceRef: cacheResourceRef,
        },
      },
    });

    for (const payload of [
      { kind: 'canvasStoryboard', storyboard: {} },
      { kind: 'canvasPrompt', prompt: 'legacy prompt' },
      { kind: 'canvasText', text: 'legacy text' },
      { kind: 'canvasStructuredContent', content: { beats: ['opening'] } },
      { kind: 'canvasAuthoringHandoff', content: '{"kind":"storyboard-draft"}' },
    ]) {
      expect(
        parseWebviewToExtensionMessage({
          type: 'sendToPlugin',
          target: 'canvas',
          payload,
        }),
      ).toBeNull();
    }

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard: {
            projectName: 'Opening',
            shots: [
              {
                id: 'shot-1',
                shotNumber: 1,
                duration: 3,
                imagePath: '/repo/shot-1.png',
                dialogue: 'Wide establishing frame',
                label: '#001',
              },
            ],
          },
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'cut',
      payload: {
        kind: 'cutStoryboard',
        storyboard: {
          projectName: 'Opening',
          shots: [
            {
              id: 'shot-1',
              shotNumber: 1,
              duration: 3,
              imagePath: '/repo/shot-1.png',
              dialogue: 'Wide establishing frame',
              label: '#001',
            },
          ],
        },
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'assetBatch',
          assets: [{ path: '/repo/a.bin', mediaType: 'unknown' }],
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'singleAsset',
          asset: {
            path: '/repo/frame.png',
            mediaType: 'image',
            resourceRef: { provider: 'document-archive' },
          },
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard: {
            projectName: 'Opening',
            shots: [
              {
                id: 'shot-1',
                shotNumber: 1,
                duration: 3,
                label: '#001',
              },
            ],
          },
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'singleAsset',
          asset: {
            path: '/repo/frame.png',
            mediaType: 'image',
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'zip' },
              entryPath: 'images/frame.png',
            },
          },
        },
      }),
    ).toBeNull();
  });

  it('rejects direct Canvas Markdown capability invocations from Webview', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokeCanvasMarkdownCapability',
        requestId: 'req-1',
        conversationId: 'conv-1',
        input: {
          capabilityId: 'canvas.ingestMarkdown',
          markdown:
            '| Scene | Shot | Visual | Image |\\n| --- | --- | --- | --- |\\n| S1 | 1 | open | P1 |',
          sourceFormat: 'gfm-table',
          intentHint: 'creative-table',
          profileHint: 'storyboard',
          resources: [
            {
              token: 'P1',
              label: 'Panel 1',
              sourcePath: '${PROJECT}/assets/panel-1.png',
            },
          ],
          target: { nodeId: 'board-1', mode: 'append' },
          provenance: { source: 'webview', label: 'assistant-storyboard-block' },
        },
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokeCanvasMarkdownCapability',
        requestId: 'req-1',
        conversationId: 'conv-1',
        input: {
          capabilityId: 'canvas.createTableFromMarkdown',
          markdown: '| Image |\\n| --- |\\n| P1 |',
          sourceFormat: 'gfm-table',
          resources: [
            {
              token: 'P1',
              sourcePath: 'vscode-webview://panel/read-image-cover.jpg',
            },
          ],
        },
      }),
    ).toBeNull();
  });

  it('rejects the removed Canvas Markdown handoff protocol path', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasMarkdownHandoff',
        requestId: 'handoff-1',
        conversationId: 'conv-1',
        markdown:
          '| Scene | Shot | Visual | Image |\\n| --- | --- | --- | --- |\\n| S1 | 1 | open | P1 |',
        sourceFormat: 'gfm-table',
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
        resources: [
          {
            token: 'P1',
            label: 'Panel 1',
            sourcePath: '${PROJECT}/assets/panel-1.png',
          },
        ],
        target: { nodeId: 'board-1', mode: 'append' },
        provenance: { source: 'webview', label: 'assistant-storyboard-block' },
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasMarkdownHandoff',
        requestId: 'handoff-1',
        conversationId: 'conv-1',
        markdown: '| A |\\n| --- |\\n| B |',
        sourceFormat: 'gfm-table',
        capabilityId: 'canvas.ingestMarkdown',
      }),
    ).toBeNull();
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasMarkdownHandoff',
        requestId: 'handoff-2',
        conversationId: 'conv-1',
        markdown: '| A |\\n| --- |\\n| B |',
        sourceFormat: 'gfm-table',
        intentHint: 'creative-table',
      }),
    ).toBeNull();
  });

  it('parses Agent-led Canvas authoring handoff requests without a selected capability', () => {
    const parsed = parseWebviewToExtensionMessage({
      type: 'requestCanvasAuthoringHandoff',
      requestId: 'authoring-handoff-1',
      conversationId: 'conv-1',
      sourceKind: 'structured-content',
      sourceFormat: 'json',
      content: '{"kind":"storyboard-draft"}',
      title: 'Storyboard Draft',
      resources: [
        {
          token: 'P1',
          sourcePath: '${PROJECT}/assets/panel-1.png',
        },
      ],
      stableRefs: [
        {
          kind: 'character',
          id: 'character-rin',
          namespace: 'entity',
          token: '@Rin',
        },
      ],
      diagnostics: [
        {
          severity: 'warning',
          code: 'prompt-span-unresolved-ref',
          message: 'Prompt span needs review.',
          token: '@Rin',
          range: { start: 0, end: 4 },
        },
      ],
      promptSpans: [
        {
          kind: 'character',
          range: { start: 0, end: 4 },
          fieldId: 'character.ref',
          label: 'Rin',
          ref: { kind: 'character', id: 'character-rin', namespace: 'entity', token: '@Rin' },
        },
      ],
      target: { containerId: 'board-1', mode: 'create-child' },
      provenance: { source: 'webview', label: 'assistant-structured-content' },
      userIntent: 'Create a Canvas storyboard draft.',
      targetHints: {
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
        operationHint: 'create-storyboard-draft',
      },
    });

    expect(parsed).toEqual({
      type: 'requestCanvasAuthoringHandoff',
      requestId: 'authoring-handoff-1',
      conversationId: 'conv-1',
      sourceKind: 'structured-content',
      sourceFormat: 'json',
      content: '{"kind":"storyboard-draft"}',
      title: 'Storyboard Draft',
      resources: [
        {
          token: 'P1',
          sourcePath: '${PROJECT}/assets/panel-1.png',
        },
      ],
      stableRefs: [
        {
          kind: 'character',
          id: 'character-rin',
          namespace: 'entity',
          token: '@Rin',
        },
      ],
      diagnostics: [
        {
          severity: 'warning',
          code: 'prompt-span-unresolved-ref',
          message: 'Prompt span needs review.',
          token: '@Rin',
          range: { start: 0, end: 4 },
        },
      ],
      promptSpans: [
        {
          kind: 'character',
          range: { start: 0, end: 4 },
          fieldId: 'character.ref',
          label: 'Rin',
          ref: { kind: 'character', id: 'character-rin', namespace: 'entity', token: '@Rin' },
        },
      ],
      target: { containerId: 'board-1', mode: 'create-child' },
      provenance: { source: 'webview', label: 'assistant-structured-content' },
      userIntent: 'Create a Canvas storyboard draft.',
      targetHints: {
        declaredIntentHint: 'creative-table',
        declaredProfileHint: 'storyboard',
        operationHint: 'create-storyboard-draft',
      },
    });
    expect(JSON.stringify(parsed)).not.toContain('capabilityId');
  });

  it('rejects Canvas authoring handoff requests that preselect a capability', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'requestCanvasAuthoringHandoff',
        requestId: 'authoring-handoff-1',
        conversationId: 'conv-1',
        sourceKind: 'generated-text',
        content: 'Create a scene card.',
        capabilityId: 'canvas_create_node',
      }),
    ).toBeNull();
  });

  it('parses Agent capability lifecycle invocations for follow-up actions', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'follow-up-1',
        conversationId: 'conv-1',
        invocation: {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'apply',
          payload: {
            capabilityId: 'canvas.createStoryboardFromMarkdown',
            markdown: '| Visual |\\n| --- |\\n| open |',
            sourceFormat: 'gfm-table',
            mode: 'create-nodes',
          },
          approval: { source: 'user-confirmation', approvedAt: 123 },
          provenance: { source: 'webview' },
        },
      }),
    ).toEqual({
      type: 'invokeAgentCapabilityLifecycle',
      requestId: 'follow-up-1',
      conversationId: 'conv-1',
      invocation: {
        capabilityId: 'canvas.createStoryboardFromMarkdown',
        phase: 'apply',
        payload: {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          markdown: '| Visual |\\n| --- |\\n| open |',
          sourceFormat: 'gfm-table',
          mode: 'create-nodes',
        },
        approval: { source: 'user-confirmation', approvedAt: 123 },
        provenance: { source: 'webview' },
      },
    });
  });

  it('rejects malformed cut storyboard transfer payloads', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard: {
            projectName: 'Opening',
            shots: [],
          },
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard: {
            projectName: 'Opening',
            shots: [
              {
                id: 'shot-1',
                shotNumber: 1,
                duration: 3,
                label: '#001',
              },
            ],
          },
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'cut',
        payload: {
          kind: 'cutStoryboard',
          storyboard: {
            projectName: 'Opening',
            shots: [
              {
                id: 'shot-1',
                shotNumber: 1,
                duration: Number.POSITIVE_INFINITY,
                imagePath: '/repo/shot-1.png',
                label: '#001',
              },
            ],
          },
        },
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
    ).toBeNull();
    expect(parseWebviewToExtensionMessage({ type: 'getPromptMode' })).toBeNull();
    expect(parseWebviewToExtensionMessage({ type: 'setPromptMode', mode: 'plan' })).toBeNull();
  });

  it('parses deleteConversation activation intent', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'deleteConversation',
        conversationId: 'conv-1',
        activateNext: false,
      }),
    ).toEqual({
      type: 'deleteConversation',
      conversationId: 'conv-1',
      activateNext: false,
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'deleteConversation',
        conversationId: 'conv-1',
      }),
    ).toEqual({
      type: 'deleteConversation',
      conversationId: 'conv-1',
    });
  });

  it('parses webview keyboard ownership messages', () => {
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
    expect(parseWebviewToExtensionMessage({ type: 'webviewKeyboardEditable' })).toBeNull();
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
