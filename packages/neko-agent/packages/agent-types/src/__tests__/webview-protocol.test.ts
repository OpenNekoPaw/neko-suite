import { describe, expect, it } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import {
  buildAmbientCanvasUpdateMessage,
  buildAgentPhaseMessage,
  buildAgentStateSnapshotMessage,
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
} from '../webview-protocol';

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
        target: 'canvas',
        payload: {
          kind: 'canvasPrompt',
          prompt: 'invalid target path',
          target: {
            nodeId: 'shot-1',
            fieldPath: 'generationPrompt',
            mode: 'replace',
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
              cachePath: '/tmp/character.glb',
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
            cachePath: '/tmp/character.glb',
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

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasStoryboard',
          storyboard: {
            mode: 'semantic',
            sourceScriptUri: 'agent://rich-content/storyboard',
            scenes: [
              {
                sceneId: 'scene-1',
                sceneTitle: 'Opening',
                sceneNumber: 1,
                shotPlans: [
                  {
                    shotNumber: 1,
                    duration: 3,
                    visualDescription: 'Wide shot',
                    characters: [],
                    shotScale: 'MS',
                    characterAction: '',
                    emotion: [],
                    sceneTags: [],
                  },
                ],
              },
            ],
          },
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: expect.objectContaining({ kind: 'canvasStoryboard' }),
      }),
    );

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

  it('parses target-aware Canvas content transfer payloads', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasPrompt',
          prompt: 'soft rim light, cinematic close-up',
          title: 'Optimized prompt',
          target: {
            plugin: 'canvas',
            nodeId: 'shot-1',
            fieldPath: '/generationPrompt',
            mode: 'replace',
          },
          provenance: {
            source: 'agent',
            conversationId: 'conv-1',
            messageId: 'msg-1',
            metadata: {
              documentResourceRef: {
                kind: 'document-entry',
                source: { filePath: '/books/a.epub', format: 'epub' },
                entryPath: 'image/Page_1.jpg',
                cachePath: '/tmp/page-1.jpg',
                versionPolicy: 'versioned-export',
              },
            },
          },
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'canvas',
      payload: {
        kind: 'canvasPrompt',
        prompt: 'soft rim light, cinematic close-up',
        title: 'Optimized prompt',
        target: {
          plugin: 'canvas',
          nodeId: 'shot-1',
          fieldPath: '/generationPrompt',
          mode: 'replace',
        },
        provenance: {
          source: 'agent',
          conversationId: 'conv-1',
          messageId: 'msg-1',
          metadata: {
            documentResourceRef: {
              kind: 'document-entry',
              source: { filePath: '/books/a.epub', format: 'epub' },
              entryPath: 'image/Page_1.jpg',
              cachePath: '/tmp/page-1.jpg',
              versionPolicy: 'versioned-export',
            },
          },
        },
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasText',
          text: 'Storyboard note',
          format: 'markdown',
          target: {
            containerId: 'scene-1',
            mode: 'create-child',
            insertionPoint: { x: 100, y: 200 },
          },
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'canvas',
      payload: {
        kind: 'canvasText',
        text: 'Storyboard note',
        format: 'markdown',
        target: {
          containerId: 'scene-1',
          mode: 'create-child',
          insertionPoint: { x: 100, y: 200 },
        },
      },
    });

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasStructuredContent',
          content: { beats: ['opening'] },
          format: 'json',
        },
      }),
    ).toEqual({
      type: 'sendToPlugin',
      target: 'canvas',
      payload: {
        kind: 'canvasStructuredContent',
        content: { beats: ['opening'] },
        format: 'json',
      },
    });
  });

  it('rejects malformed Canvas content transfer targets', () => {
    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasText',
          text: 'Prompt-only format is invalid for plain text payloads',
          format: 'prompt',
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasStructuredContent',
          content: undefined,
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasPrompt',
          prompt: 'hello',
          target: { mode: 'erase' },
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasPrompt',
          prompt: 'hello',
          target: { insertionPoint: { x: Number.NaN, y: 10 } },
        },
      }),
    ).toBeNull();

    expect(
      parseWebviewToExtensionMessage({
        type: 'sendToPlugin',
        target: 'canvas',
        payload: {
          kind: 'canvasPrompt',
          prompt: 'hello',
          provenance: {
            source: 'agent',
            metadata: ['not', 'a', 'record'],
          },
        },
      }),
    ).toBeNull();
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
