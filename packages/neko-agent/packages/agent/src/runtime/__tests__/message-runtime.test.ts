import { describe, expect, it, vi } from 'vitest';
import {
  appendAmbientCanvasSystemPrompt,
  buildAgentAssistantMessageFromStream,
  buildAgentExecutionMetadata,
  buildAgentHistoryHydrationPlan,
  buildAgentProjectFileSearchPlan,
  buildAgentTurnConfigurationPlan,
  buildAgentTurnContextPatch,
  buildAgentTurnExecutionMetadata,
  buildAgentTurnRuntimePlan,
  buildEnhancedAgentMessage,
  buildProviderExpressionTargets,
  buildRuntimeMediaModelSelections,
  createAgentMessageId,
  executeAgentProjectFileSearch,
  formatAgentContextPayload,
  getAgentHistoryToHydrate,
  mergeReferencedMediaImageAttachments,
  prepareAgentMessageDispatch,
  prepareAgentMessageFileReferences,
  projectAgentFileMentions,
  projectAgentMentionExtras,
  projectAgentProjectFilesMessage,
  projectContextReferences,
  runAgentMessageTurnRuntime,
  selectAgentTurnProvider,
  shouldHydrateAgentHistory,
  shouldPersistAgentAssistantStream,
  summarizeAgentEventProgress,
} from '../message-runtime';

describe('message runtime helpers', () => {
  it('creates deterministic agent message ids when adapters are provided', () => {
    expect(
      createAgentMessageId({
        now: () => 1000,
        randomSuffix: () => 'abc123456',
      }),
    ).toBe('1000-abc123456');
  });

  it('maps agent media models to capability-specific provider expression targets', () => {
    expect(
      buildProviderExpressionTargets({
        image: { providerId: 'flux', modelId: 'flux-pro-1.1', category: 'image' },
        video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      }),
    ).toEqual([
      { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro-1.1' },
      { capability: 'video.generate', providerId: 'runway', modelId: 'gen-4' },
    ]);
  });

  it('maps a non-agent media model to all generation capabilities', () => {
    expect(
      buildProviderExpressionTargets(undefined, {
        providerId: 'openai',
        modelId: 'gpt-image-1',
        category: 'image',
      }),
    ).toEqual([
      { capability: 'image.generate', providerId: 'openai', modelId: 'gpt-image-1' },
      { capability: 'video.generate', providerId: 'openai', modelId: 'gpt-image-1' },
      { capability: 'audio.generate', providerId: 'openai', modelId: 'gpt-image-1' },
    ]);
  });

  it('projects agent audio media model to audio and music runtime slots', () => {
    expect(
      buildRuntimeMediaModelSelections({
        audio: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      }),
    ).toEqual({
      audio: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
      music: { providerId: 'suno', modelId: 'chirp', category: 'audio' },
    });
  });

  it('merges plan-mode IDC metadata with execution overrides and media models', () => {
    expect(
      buildAgentTurnExecutionMetadata(
        'plan',
        {
          idc: {
            taskShape: 'single-step',
            custom: true,
          },
          traceId: 'trace-1',
        },
        {
          image: { providerId: 'flux', modelId: 'flux-pro-1.1', category: 'image' },
        },
      ),
    ).toEqual({
      idc: {
        entrySignal: 'vague-creative',
        taskShape: 'single-step',
        runKind: 'plan-mode',
        custom: true,
      },
      traceId: 'trace-1',
      mediaModels: {
        image: { providerId: 'flux', modelId: 'flux-pro-1.1', category: 'image' },
      },
    });
  });

  it('builds execution metadata from context packet and conversation lineage', () => {
    expect(
      buildAgentExecutionMetadata({
        metadata: { traceId: 'trace-1' },
        multimodalContextPacket: { kind: 'canvas-selection' },
        conversationId: 'conv-1',
        parentAgentId: 'agent-conv-1',
      }),
    ).toEqual({
      traceId: 'trace-1',
      multimodalContextPacket: { kind: 'canvas-selection' },
      conversationId: 'conv-1',
      parentAgentId: 'agent-conv-1',
    });
  });

  it('summarizes agent events into subagent progress labels', () => {
    expect(
      summarizeAgentEventProgress({
        type: 'tool_progress',
        toolProgress: {
          toolCallId: 'tool-1',
          toolName: 'read_file',
          percent: 42,
          stage: 'Reading file',
        },
      }),
    ).toBe('42% Reading file');
  });

  it('assembles enhanced user message from referenced files and attachments', () => {
    expect(
      buildEnhancedAgentMessage({
        message: 'please inspect this',
        contextPayloads: [
          {
            type: 'document-selection',
            id: 'selection-1',
            label: 'Selection',
            summary: 'Selected text',
            data: { selectedText: 'hello world' },
          },
        ],
        fileContents: [{ path: 'src/app.ts', content: 'export const app = true;' }],
        attachmentText: '\nAttachment body',
      }),
    ).toContain('### File: src/app.ts');
  });

  it('formats structured context payloads inside the agent runtime', () => {
    expect(
      formatAgentContextPayload({
        type: 'document-selection',
        id: 'selection-1',
        label: 'Selection',
        summary: 'Selected text',
        data: { selectedText: 'hello world' },
      }),
    ).toBe('[Content: Selection]\nhello world');

    expect(
      formatAgentContextPayload({
        type: 'file',
        id: 'file-1',
        label: 'notes.md',
        summary: 'File notes',
        data: { filePath: 'notes.md' },
      }),
    ).toBe('[File: notes.md]\nnotes.md');
  });

  it('prepares referenced file contents with injected input processor', async () => {
    const onReferenceError = vi.fn();

    const result = await prepareAgentMessageFileReferences({
      messageText: 'inspect @src/app.ts',
      inputProcessor: {
        process: async () => ({
          fileReferences: [
            { path: 'src/app.ts', content: 'export const app = true;' },
            { path: 'src/missing.ts' },
          ],
          errors: [{ reference: '@src/missing.ts', error: 'missing' }],
        }),
      },
      onReferenceError,
    });

    expect(result).toEqual({
      message: 'inspect @src/app.ts',
      fileContents: [{ path: 'src/app.ts', content: 'export const app = true;' }],
    });
    expect(onReferenceError).toHaveBeenCalledWith({
      reference: '@src/missing.ts',
      error: 'missing',
    });
  });

  it('keeps message usable when referenced file processor throws', async () => {
    const onProcessingError = vi.fn();

    await expect(
      prepareAgentMessageFileReferences({
        messageText: 'inspect @src/app.ts',
        inputProcessor: {
          process: async () => {
            throw new Error('processor failed');
          },
        },
        onProcessingError,
      }),
    ).resolves.toEqual({ message: 'inspect @src/app.ts', fileContents: [] });
    expect(onProcessingError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('merges preprocessed referenced media images lazily', async () => {
    const onProcessed = vi.fn();
    const createMediaProcessor = vi.fn().mockResolvedValue({
      process: vi.fn().mockResolvedValue({
        type: 'video-frames',
        images: [{ media_type: 'image/jpeg', data: 'frame-1' }],
        metadata: { frameCount: 1 },
      }),
    });

    await expect(
      mergeReferencedMediaImageAttachments({
        message: '[File: clip.mp4]\n/tmp/clip.mp4',
        existingImages: [{ type: 'base64', media_type: 'image/png', data: 'existing' }],
        createMediaProcessor,
        onProcessed,
      }),
    ).resolves.toEqual([
      { type: 'base64', media_type: 'image/png', data: 'existing' },
      { type: 'base64', media_type: 'image/jpeg', data: 'frame-1' },
    ]);
    expect(createMediaProcessor).toHaveBeenCalledTimes(1);
    expect(onProcessed).toHaveBeenCalledWith({
      filePath: '/tmp/clip.mp4',
      mediaType: 'video-frames',
      metadata: { frameCount: 1 },
    });
  });

  it('does not create a media processor when no file chips exist', async () => {
    const createMediaProcessor = vi.fn();

    await expect(
      mergeReferencedMediaImageAttachments({
        message: 'plain text',
        existingImages: [],
        createMediaProcessor,
      }),
    ).resolves.toEqual([]);
    expect(createMediaProcessor).not.toHaveBeenCalled();
  });

  it('prepares a complete media dispatch from files, attachments, and referenced media', async () => {
    const createReferencedMediaProcessor = vi.fn().mockResolvedValue({
      process: vi.fn().mockResolvedValue({
        type: 'video-frames',
        images: [{ media_type: 'image/jpeg', data: 'frame-1' }],
      }),
    });

    await expect(
      prepareAgentMessageDispatch({
        request: {
          conversationId: 'conv-1',
          messageText: 'render this [File: clip]\n/tmp/clip.mp4',
          sessionMode: 'image',
          mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          attachments: [{ id: 'att-1', name: 'notes.txt', type: 'file', path: '/tmp/notes.txt' }],
        },
        inputProcessor: {
          process: async () => ({
            fileReferences: [{ path: 'src/story.md', content: 'Story beat' }],
            errors: [],
          }),
        },
        processAttachments: async () => ({
          textContent: '\nAttachment notes',
          imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'attached' }],
        }),
        createReferencedMediaProcessor,
        generateMessageId: () => 'user-1',
        now: () => 123,
      }),
    ).resolves.toEqual({
      conversationId: 'conv-1',
      enhancedMessage: expect.stringContaining('### File: src/story.md'),
      userMessage: {
        id: 'user-1',
        role: 'user',
        content: 'render this [File: clip]\n/tmp/clip.mp4',
        timestamp: 123,
        attachments: [{ id: 'att-1', name: 'notes.txt', type: 'file', path: '/tmp/notes.txt' }],
      },
      mediaImages: [
        { type: 'base64', media_type: 'image/png', data: 'attached' },
        { type: 'base64', media_type: 'image/jpeg', data: 'frame-1' },
      ],
      route: {
        kind: 'media',
        mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      },
    });
    expect(createReferencedMediaProcessor).toHaveBeenCalledTimes(1);
  });

  it('routes agent-mode messages to the agent path', async () => {
    await expect(
      prepareAgentMessageDispatch({
        request: {
          conversationId: 'conv-1',
          messageText: 'help',
          sessionMode: 'agent',
        },
        processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
        generateMessageId: () => 'user-1',
        now: () => 123,
      }),
    ).resolves.toEqual({
      conversationId: 'conv-1',
      enhancedMessage: 'help',
      userMessage: {
        id: 'user-1',
        role: 'user',
        content: 'help',
        timestamp: 123,
      },
      mediaImages: [],
      route: { kind: 'agent' },
    });
  });

  it('rejects message turns without an explicit conversationId', async () => {
    const postMessage = vi.fn();
    const persistUserMessage = vi.fn();
    const processAttachments = vi.fn(async () => ({
      textContent: '',
      imageAttachments: [],
    }));
    const onMissingConversationId = vi.fn();

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: '',
          messageText: 'hello',
          sessionMode: 'agent',
        },
        processAttachments,
        persistUserMessage,
        postMessage,
        onMissingConversationId,
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'rejected-missing-conversation' });

    expect(onMissingConversationId).toHaveBeenCalledTimes(1);
    expect(processAttachments).not.toHaveBeenCalled();
    expect(persistUserMessage).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'globalError',
      message: 'Cannot send message without an explicit conversationId.',
    });
  });

  it('persists the user message and posts thinking before executing an agent turn', async () => {
    const events: string[] = [];
    const executeAgentTurn = vi.fn(async () => {
      events.push('execute-agent');
    });

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'inspect @src/app.ts',
          sessionMode: 'agent',
          chatModel: { providerId: 'anthropic', modelId: 'claude', category: 'llm' },
        },
        inputProcessor: {
          process: async () => ({
            fileReferences: [{ path: 'src/app.ts', content: 'export const app = true;' }],
            errors: [],
          }),
        },
        processAttachments: async () => ({
          textContent: '\nAttachment body',
          imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'image-1' }],
        }),
        persistUserMessage: (conversationId, message) => {
          events.push(`persist:${conversationId}:${message.role}`);
        },
        postMessage: (message) => {
          events.push(`post:${message.type}`);
        },
        executeAgentTurn,
        generateMessageId: () => 'user-1',
        now: () => 123,
      }),
    ).resolves.toEqual({ status: 'agent-dispatched' });

    expect(events).toEqual(['persist:conv-1:user', 'post:thinking', 'execute-agent']);
    expect(executeAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        message: expect.stringContaining('### File: src/app.ts'),
        chatModel: { providerId: 'anthropic', modelId: 'claude', category: 'llm' },
        imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'image-1' }],
      }),
    );
  });

  it('dispatches non-agent media turns when a media runtime is available', async () => {
    const executeMediaTurn = vi.fn(async () => undefined);
    const executeAgentTurn = vi.fn(async () => undefined);

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'render image',
          sessionMode: 'image',
          mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
        processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
        persistUserMessage: vi.fn(),
        postMessage: vi.fn(),
        executeMediaTurn,
        executeAgentTurn,
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'media-dispatched' });

    expect(executeMediaTurn).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      prompt: 'render image',
      mediaModel: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
    });
    expect(executeAgentTurn).not.toHaveBeenCalled();
  });

  it('falls back with a scoped error when no agent runtime is available', async () => {
    const postMessage = vi.fn();

    await expect(
      runAgentMessageTurnRuntime({
        request: {
          conversationId: 'conv-1',
          messageText: 'hello',
          sessionMode: 'agent',
        },
        processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
        persistUserMessage: vi.fn(),
        postMessage,
        generateMessageId: () => 'user-1',
      }),
    ).resolves.toEqual({ status: 'fallback', reason: 'no-agent-runtime' });

    expect(postMessage).toHaveBeenNthCalledWith(1, {
      type: 'thinking',
      conversationId: 'conv-1',
    });
    expect(postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'error', conversationId: 'conv-1' }),
    );
  });

  it('appends ambient canvas context to the system prompt', () => {
    expect(
      appendAmbientCanvasSystemPrompt('base prompt', [
        { nodeId: 'node-1', type: 'image', summary: 'Hero frame' },
      ]),
    ).toContain('[image] Hero frame (id: node-1)');
  });

  it('builds a project file search plan for the host adapter', () => {
    expect(buildAgentProjectFileSearchPlan({ filter: 'app', limit: 12 })).toEqual({
      includePattern: '**/*app*',
      excludePattern: '**/node_modules/**,**/.git/**,**/dist/**,**/build/**',
      limit: 12,
    });
  });

  it('projects host file candidates to mention file rows', () => {
    expect(
      projectAgentFileMentions([
        { relativePath: 'src/app.ts' },
        { relativePath: 'docs\\intro.md' },
      ]),
    ).toEqual([
      { path: 'src/app.ts', name: 'app.ts', type: 'file' },
      { path: 'docs/intro.md', name: 'intro.md', type: 'file' },
    ]);
  });

  it('projects canvas ambient nodes to filtered mention extras', () => {
    expect(
      projectAgentMentionExtras(
        [
          { nodeId: 'node-1', type: 'shot', summary: 'Hero frame' },
          { nodeId: 'node-2', type: 'scene', summary: 'Outro scene' },
        ],
        'hero',
      ),
    ).toEqual([
      {
        type: 'canvas-node',
        id: 'node-1',
        label: 'Hero frame',
        summary: 'Canvas: Hero frame',
      },
    ]);
  });

  it('builds the projectFiles webview message with explicit conversation scope', () => {
    expect(
      projectAgentProjectFilesMessage({
        conversationId: 'conv-1',
        filter: '',
        files: [{ relativePath: 'src/app.ts' }],
        canvasNodes: [{ nodeId: 'node-1', type: 'shot', summary: 'Hero frame' }],
      }),
    ).toEqual({
      type: 'projectFiles',
      conversationId: 'conv-1',
      files: [{ path: 'src/app.ts', name: 'app.ts', type: 'file' }],
      mentionExtras: [
        {
          type: 'canvas-node',
          id: 'node-1',
          label: 'Hero frame',
          summary: 'Canvas: Hero frame',
        },
      ],
    });
  });

  it('executes project file search through host adapters and merges canvas mentions', async () => {
    const searchProjectFiles = vi.fn(async () => [
      { relativePath: 'src/app.ts' },
      { relativePath: 'docs\\intro.md' },
    ]);

    await expect(
      executeAgentProjectFileSearch({
        conversationId: 'conv-1',
        filter: 'app',
        searchProjectFiles,
        getCanvasNodes: () => [{ nodeId: 'node-1', type: 'shot', summary: 'App hero' }],
      }),
    ).resolves.toEqual({
      type: 'projectFiles',
      conversationId: 'conv-1',
      files: [
        { path: 'src/app.ts', name: 'app.ts', type: 'file' },
        { path: 'docs/intro.md', name: 'intro.md', type: 'file' },
      ],
      mentionExtras: [
        {
          type: 'canvas-node',
          id: 'node-1',
          label: 'App hero',
          summary: 'Canvas: App hero',
        },
      ],
    });
    expect(searchProjectFiles).toHaveBeenCalledWith({
      includePattern: '**/*app*',
      excludePattern: '**/node_modules/**,**/.git/**,**/dist/**,**/build/**',
      limit: 30,
    });
  });

  it('keeps project file search usable when the host search adapter fails', async () => {
    const onSearchError = vi.fn();

    await expect(
      executeAgentProjectFileSearch({
        conversationId: 'conv-1',
        filter: 'missing',
        searchProjectFiles: async () => {
          throw new Error('findFiles failed');
        },
        getCanvasNodes: () => [{ nodeId: 'node-1', type: 'shot', summary: 'Fallback shot' }],
        onSearchError,
      }),
    ).resolves.toEqual({
      type: 'projectFiles',
      conversationId: 'conv-1',
      files: [],
      mentionExtras: [],
    });
    expect(onSearchError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('projects a successful agent stream result into a persisted assistant message', () => {
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-1',
        timestamp: 123,
        stream: {
          accumulatedResponse: 'Done',
          accumulatedThinking: 'Thinking',
          hasError: false,
          collectedToolCalls: [
            {
              id: 'call-1',
              name: 'read_file',
              arguments: { path: 'src/app.ts' },
              result: { success: true, data: { ok: true } },
            },
          ],
          contentBlocks: [
            {
              id: 'block-1',
              type: 'text',
              timestamp: 123,
              content: 'Done',
              isStreaming: false,
            },
          ],
        },
      }),
    ).toEqual({
      id: 'msg-1',
      role: 'assistant',
      content: 'Done',
      timestamp: 123,
      thinking: 'Thinking',
      toolCalls: [
        {
          id: 'call-1',
          name: 'read_file',
          arguments: { path: 'src/app.ts' },
          result: { success: true, data: { ok: true } },
        },
      ],
      contentBlocks: [
        {
          id: 'block-1',
          type: 'text',
          timestamp: 123,
          content: 'Done',
          isStreaming: false,
        },
      ],
    });
  });

  it('does not persist empty or failed agent stream results', () => {
    const emptyStream = {
      accumulatedResponse: '',
      accumulatedThinking: '',
      hasError: false,
      collectedToolCalls: [],
      contentBlocks: [],
    };

    expect(shouldPersistAgentAssistantStream(emptyStream)).toBe(false);
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-empty',
        timestamp: 123,
        stream: emptyStream,
      }),
    ).toBeNull();
    expect(
      buildAgentAssistantMessageFromStream({
        id: 'msg-error',
        timestamp: 123,
        stream: {
          ...emptyStream,
          accumulatedResponse: 'Partial',
          hasError: true,
        },
      }),
    ).toBeNull();
  });

  it('builds agent context patch with canvas packet taking precedence over timeline packet', () => {
    expect(
      buildAgentTurnContextPatch({
        imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'abc' }],
        timelineContextPacket: { kind: 'timeline' },
        canvasNodes: [{ nodeId: 'node-1', type: 'shot', summary: 'Hero frame' }],
        canvasContextPacket: { kind: 'canvas' },
        executionMetadata: { traceId: 'trace-1' },
      }),
    ).toEqual({
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'abc' }],
      canvasContext: {
        selectedNodes: [{ nodeId: 'node-1', type: 'shot', summary: 'Hero frame' }],
      },
      multimodalContextPacket: { kind: 'canvas' },
      metadata: { traceId: 'trace-1' },
    });
  });

  it('builds agent context patch with timeline packet when no canvas packet exists', () => {
    expect(
      buildAgentTurnContextPatch({
        imageAttachments: [],
        timelineContextPacket: { kind: 'timeline' },
        canvasNodes: [],
      }),
    ).toEqual({
      multimodalContextPacket: { kind: 'timeline' },
    });
  });

  it('builds a turn runtime plan for provider context and execution metadata', () => {
    expect(
      buildAgentTurnRuntimePlan({
        executionMode: 'ask',
        executionOverrides: { metadata: { traceId: 'trace-1' } },
        mediaModels: {
          video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
        },
      }),
    ).toEqual({
      providerExpressionTargets: [
        { capability: 'video.generate', providerId: 'runway', modelId: 'gen-4' },
      ],
      runtimeMediaModels: {
        video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
      },
      executionMetadata: {
        traceId: 'trace-1',
        mediaModels: {
          video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
        },
      },
    });
  });

  it('selects requested configured provider before falling back to default provider', () => {
    const providers = new Map([
      ['openai', { id: 'openai', isConfigured: true }],
      ['anthropic', { id: 'anthropic', isConfigured: true }],
    ]);

    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'openai',
        selectedProviderId: 'anthropic',
        getProvider: (id) => providers.get(id),
        getDefaultProvider: () => providers.get('anthropic'),
      }),
    ).toEqual({
      ok: true,
      effectiveProviderId: 'openai',
      provider: { id: 'openai', isConfigured: true },
    });
  });

  it('falls back to default provider when requested provider is unavailable', () => {
    const defaultProvider = { id: 'anthropic', isConfigured: true };

    expect(
      selectAgentTurnProvider({
        requestedProviderId: 'missing',
        getProvider: () => undefined,
        getDefaultProvider: () => defaultProvider,
      }),
    ).toEqual({
      ok: true,
      effectiveProviderId: 'missing',
      provider: defaultProvider,
    });
  });

  it('returns a no-provider result when no configured provider is available', () => {
    expect(
      selectAgentTurnProvider({
        selectedProviderId: 'openai',
        getProvider: () => ({ id: 'openai', isConfigured: false }),
        getDefaultProvider: () => undefined,
      }),
    ).toEqual({
      ok: false,
      effectiveProviderId: 'openai',
      reason: 'no-provider-configured',
    });
  });

  it('decides whether conversation history should hydrate a fresh agent session', () => {
    expect(shouldHydrateAgentHistory({ agentHistoryLength: 0, conversationMessageCount: 2 })).toBe(
      true,
    );
    expect(shouldHydrateAgentHistory({ agentHistoryLength: 1, conversationMessageCount: 2 })).toBe(
      false,
    );
    expect(getAgentHistoryToHydrate(['user', 'assistant', 'current'])).toEqual([
      'user',
      'assistant',
    ]);
    expect(
      buildAgentHistoryHydrationPlan({
        agentHistoryLength: 0,
        conversationMessageCount: 3,
        fullHistory: ['user', 'assistant', 'current'],
      }),
    ).toEqual({
      kind: 'load-history',
      historyToLoad: ['user', 'assistant'],
    });
    expect(
      buildAgentHistoryHydrationPlan({
        agentHistoryLength: 1,
        conversationMessageCount: 3,
        fullHistory: ['user', 'assistant', 'current'],
      }),
    ).toEqual({
      kind: 'skip',
      reason: 'agent-history-not-empty',
    });
  });

  it('builds agent turn configuration without host-specific platform objects', () => {
    expect(
      buildAgentTurnConfigurationPlan({
        conversationId: 'conv-1',
        baseSystemPrompt: 'base',
        ambientCanvas: [{ nodeId: 'node-1', type: 'shot', summary: 'Opening shot' }],
        isPlanMode: true,
        executionMode: 'auto',
        chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
        mediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
        executionOverrides: { metadata: { traceId: 'trace-1' } },
        temperature: 0.7,
        workspaceRoot: '/repo',
      }),
    ).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        executionMode: 'plan',
        modelId: 'gpt-4.1',
        temperature: 0.7,
        workspaceRoot: '/repo',
        maxIterations: 200,
        providerExpressionTargets: [
          { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro' },
        ],
        executionMetadata: expect.objectContaining({
          traceId: 'trace-1',
          mediaModels: {
            image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          },
        }),
      }),
    );
  });

  it('lets per-turn execution overrides bypass prompt-mode defaults', () => {
    expect(
      buildAgentTurnConfigurationPlan({
        conversationId: 'conv-1',
        baseSystemPrompt: 'base',
        isPlanMode: true,
        executionMode: 'ask',
        executionOverrides: { executionMode: 'auto' },
      }),
    ).toEqual(
      expect.objectContaining({
        executionMode: 'auto',
        executionMetadata: undefined,
      }),
    );
  });

  it('projectContextReferences extracts lightweight references from payloads', () => {
    expect(projectContextReferences(undefined)).toBeUndefined();
    expect(projectContextReferences([])).toBeUndefined();

    expect(
      projectContextReferences([
        {
          type: 'file',
          id: 'f1',
          label: 'notes.txt',
          summary: 'File: notes.txt',
          data: { filePath: '/tmp/notes.txt' },
        },
        {
          type: 'canvas-node',
          id: 'node-42',
          label: 'Shot #003',
          summary: 'Wide shot',
          data: { nodes: ['node-42'] },
        },
        {
          type: 'story-selection',
          id: 's1',
          label: 'Scene 1',
          summary: 'Selected text',
          data: { selectedText: 'Once upon a time' },
        },
      ]),
    ).toEqual([
      {
        type: 'file',
        id: 'f1',
        label: 'notes.txt',
        navigationData: { filePath: '/tmp/notes.txt' },
      },
      {
        type: 'canvas-node',
        id: 'node-42',
        label: 'Shot #003',
        navigationData: { nodeId: 'node-42' },
      },
      { type: 'story-selection', id: 's1', label: 'Scene 1' },
    ]);
  });

  it('prepareAgentMessageDispatch includes contextReferences in userMessage', async () => {
    const result = await prepareAgentMessageDispatch({
      request: {
        conversationId: 'conv-1',
        messageText: 'describe this',
        sessionMode: 'agent',
        contextPayloads: [
          {
            type: 'file',
            id: 'f1',
            label: 'img.png',
            summary: '',
            data: { filePath: '/tmp/img.png' },
          },
        ],
      },
      processAttachments: async () => ({ textContent: '', imageAttachments: [] }),
      generateMessageId: () => 'msg-1',
      now: () => 100,
    });

    expect(result.userMessage.contextReferences).toEqual([
      { type: 'file', id: 'f1', label: 'img.png', navigationData: { filePath: '/tmp/img.png' } },
    ]);
  });
});
