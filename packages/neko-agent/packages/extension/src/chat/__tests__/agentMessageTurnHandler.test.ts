import { describe, it, expect, vi, beforeEach } from 'vitest';

const agentStreamProcessorInstances = vi.hoisted(
  () => [] as Array<{ deps: Record<string, unknown> }>,
);

vi.mock('vscode', () => {
  class EventEmitter<T> {
    private readonly listeners: Array<(event: T) => void> = [];

    readonly event = (listener: (event: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };

    fire(event: T): void {
      for (const listener of this.listeners) listener(event);
    }

    dispose(): void {
      this.listeners.length = 0;
    }
  }

  class RelativePattern {
    constructor(
      readonly base: string,
      readonly pattern: string,
    ) {}
  }

  return {
    EventEmitter,
    FileType: { File: 1, Directory: 2 },
    RelativePattern,
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (base: { fsPath: string }, filePath: string) => ({
        fsPath: `${base.fsPath}/${filePath}`,
      }),
    },
    extensions: {
      getExtension: vi.fn(),
    },
    env: {
      language: 'en',
    },
    commands: {
      executeCommand: vi.fn(),
    },
    window: {
      activeTextEditor: undefined,
      onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    },
    workspace: {
      workspaceFolders: undefined,
      fs: {
        readFile: vi.fn(),
        stat: vi.fn(),
      },
      findFiles: vi.fn().mockResolvedValue([]),
      asRelativePath: vi.fn((value: { fsPath?: string } | string) =>
        typeof value === 'string' ? value : (value.fsPath ?? ''),
      ),
    },
  };
});
import * as vscode from 'vscode';
import {
  createAgentCapabilityActivationIntent,
  createAgentCapabilityActivationProgressEvent,
} from '@neko/shared';
import {
  buildProviderExpressionTargets,
  type AgentMessageRuntimeRequest,
  type AgentRunnerPortEvent,
} from '@neko/agent/runtime';
import {
  DEFAULT_MENTION_EXCLUDE_GLOB,
  getConversationWorkDirHash,
  type SubAgentEvent,
} from '@neko/agent';
import { AgentMessageTurnHandler } from '../agentMessageTurnHandler';

// Mock @neko/agent module - createInputProcessor is used inside _getInputProcessor
vi.mock('@neko/agent', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/agent')>();
  return {
    ...actual,
    createInputProcessor: vi.fn(() => ({
      process: vi.fn(async (msg: string) => ({
        message: msg,
        fileReferences: [],
        errors: [],
      })),
    })),
  };
});

vi.mock('@neko/platform', async (importOriginal) => {
  return await importOriginal<typeof import('@neko/platform')>();
});

// Mock ../ai/agentContext
vi.mock('../ai/agentContext', () => ({
  createDefaultAgentContext: vi.fn(() => ({
    activeEditor: undefined,
    workspaceRoot: undefined,
    projectType: 'unknown',
  })),
}));

// Mock ../base logger
vi.mock('../base', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  createServiceId: vi.fn((name: string) => name),
}));

// Mock message sub-processors
// NOTE: vitest v4 requires class-based mocks for `new` calls (vi.fn().mockImplementation is not a valid constructor)
vi.mock('../message/attachmentProcessor', () => {
  return {
    AttachmentProcessor: class {
      processAttachments = vi.fn().mockResolvedValue({
        textContent: '',
        imageAttachments: [],
      });
    },
  };
});

vi.mock('../message/agentStreamProcessor', () => {
  return {
    AgentStreamProcessor: class {
      constructor(public readonly deps: Record<string, unknown>) {
        agentStreamProcessorInstances.push(this);
      }

      processStream = vi.fn().mockResolvedValue({
        accumulatedResponse: 'mock response',
        accumulatedThinking: '',
        collectedToolCalls: [],
        contentBlocks: [],
        hasError: false,
      });
      clearConversation = vi.fn();
      dispose = vi.fn();
    },
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: { fsPath?: string }) => ({
      toString: () => `webview:${uri.fsPath ?? ''}`,
    })),
  };
}

function createMessageRequest(
  messageText = 'hello',
  overrides: Partial<AgentMessageRuntimeRequest> = {},
): AgentMessageRuntimeRequest {
  return {
    conversationId: 'conv-1',
    messageText,
    sessionMode: 'agent',
    ...overrides,
  };
}

function createChatModelRequest(
  messageText = 'hello',
  overrides: Partial<AgentMessageRuntimeRequest> = {},
): AgentMessageRuntimeRequest {
  return createMessageRequest(messageText, {
    chatModel: { providerId: 'anthropic', modelId: 'claude-3', category: 'llm' },
    ...overrides,
  });
}

/** Minimal SettingsManager-shaped object */
function createMockSettings() {
  return {
    selectedProviderId: null as string | null,
    selectedModelId: null as string | null,
    customSystemPrompt: '',
    autoExecuteTools: true,
    temperature: 0.7,
    maxTokens: 8192,
    executionMode: 'ask' as const,
    get: vi.fn((key: string) => undefined),
    update: vi.fn(),
  };
}

/** Minimal ProviderManager-shaped object — no configured provider by default */
function createMockProviders(isConfigured = false) {
  const providerConfig = {
    id: 'anthropic',
    name: 'anthropic',
    displayName: 'Anthropic',
    type: 'anthropic' as const,
    apiUrl: 'https://api.anthropic.test',
    apiKey: 'sk-test',
    enabled: true,
    protocolProfile: 'anthropic' as const,
  };
  const model = {
    id: 'claude-3',
    name: 'claude-3',
    displayName: 'Claude 3',
    providerId: 'anthropic',
    type: 'llm' as const,
    capabilities: ['chat', 'thinking', 'sampling'],
    enabled: true,
  };
  const provider = isConfigured
    ? {
        id: 'anthropic',
        isConfigured: true,
        defaultModel: 'claude-3',
        modelIds: ['claude-3'],
        modelCapabilities: { 'claude-3': model.capabilities },
      }
    : undefined;
  return {
    getProvider: vi.fn().mockReturnValue(provider),
    getDefaultProvider: vi.fn().mockReturnValue(provider),
    getProviderConfig: vi.fn().mockReturnValue(isConfigured ? providerConfig : undefined),
    getModel: vi.fn().mockReturnValue(isConfigured ? model : undefined),
  };
}

function createDeepSeekProvidersWithGatewayCandidate() {
  const providers = new Map([
    [
      'deepseek-chat',
      {
        id: 'deepseek-chat',
        isConfigured: true,
        defaultModel: 'deepseek-v4-pro',
        modelIds: ['deepseek-v4-pro'],
        modelCapabilities: { 'deepseek-v4-pro': ['chat', 'streaming'] },
      },
    ],
    [
      'nekoapi-chat',
      {
        id: 'nekoapi-chat',
        isConfigured: true,
        defaultModel: 'gateway-chat',
        modelIds: ['gateway-chat'],
        modelCapabilities: { 'gateway-chat': ['chat', 'streaming', 'vision'] },
      },
    ],
  ]);
  const providerConfigs = new Map([
    [
      'deepseek-chat',
      {
        id: 'deepseek-chat',
        name: 'deepseek',
        displayName: 'DeepSeek',
        type: 'generic' as const,
        apiUrl: 'https://api.deepseek.com/v1',
        enabled: true,
        connectionKind: 'direct' as const,
        protocolProfile: 'openai-chat' as const,
      },
    ],
    [
      'nekoapi-chat',
      {
        id: 'nekoapi-chat',
        name: 'nekoapi',
        displayName: 'NekoAPI',
        type: 'newapi' as const,
        apiUrl: 'https://www.nekoapi.com/v1',
        enabled: true,
        connectionKind: 'gateway' as const,
        protocolProfile: 'newapi' as const,
      },
    ],
  ]);
  const models = new Map([
    [
      'deepseek-v4-pro',
      {
        id: 'deepseek-v4-pro',
        name: 'deepseek-chat',
        displayName: 'DeepSeek V4 Pro',
        providerId: 'deepseek-chat',
        type: 'llm' as const,
        capabilities: ['chat', 'streaming'],
        enabled: true,
      },
    ],
    [
      'gateway-chat',
      {
        id: 'gateway-chat',
        name: 'gateway-chat',
        displayName: 'Gateway Chat',
        providerId: 'nekoapi-chat',
        type: 'llm' as const,
        capabilities: ['chat', 'streaming', 'vision'],
        enabled: true,
      },
    ],
  ]);

  return {
    getProvider: vi.fn((providerId: string) => providers.get(providerId)),
    getDefaultProvider: vi.fn(() => providers.get('deepseek-chat')),
    getProviderConfig: vi.fn((providerId: string) => providerConfigs.get(providerId)),
    getModel: vi.fn((modelId: string) => models.get(modelId)),
  };
}

/** Minimal ConversationBridge-shaped object */
function createMockConversations() {
  const msgs: unknown[] = [];
  return {
    ensureActive: vi.fn().mockReturnValue('conv-1'),
    addMessageToConversation: vi.fn((_id: string, msg: unknown) => msgs.push(msg)),
    removeMessageFromConversation: vi.fn((_id: string, messageId: string) => {
      const index = msgs.findIndex((item) => (item as { id?: string }).id === messageId);
      if (index !== -1) {
        msgs.splice(index, 1);
      }
    }),
    upsertMessageToConversation: vi.fn((_id: string, msg: unknown) => {
      const message = msg as { id?: string };
      const index = msgs.findIndex((item) => (item as { id?: string }).id === message.id);
      if (index === -1) {
        msgs.push(msg);
      } else {
        msgs[index] = msg;
      }
    }),
    addMessage: vi.fn(),
    getActiveId: vi.fn().mockReturnValue('conv-1'),
    get: vi.fn().mockReturnValue({ id: 'conv-1', messages: msgs }),
    getMessages: () => msgs,
    toAgentHistory: vi.fn().mockReturnValue([]),
    manager: {
      toAgentHistory: vi.fn().mockReturnValue([]),
    },
  };
}

/** Minimal IAgentRunner — returned by agentManager.getOrCreate */
function createMockAgentRunner() {
  let runnerEventListener: ((event: AgentRunnerPortEvent) => void) | undefined;
  const subAgentEventDisposable = {
    dispose: vi.fn(() => {
      runnerEventListener = undefined;
    }),
  };

  const pendingMessages: Array<{
    id: string;
    conversationId: string;
    content: string;
    createdAt: number;
    source: 'composer' | 'task-result-observation';
  }> = [];
  return {
    getHistory: vi.fn().mockReturnValue([]),
    getConfig: vi.fn(),
    configure: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockReturnValue((async function* () {})()),
    isRunning: vi.fn().mockReturnValue(false),
    enqueuePendingMessage: vi.fn(
      (input: {
        conversationId: string;
        content: string;
        now?: number;
        source?: 'composer' | 'task-result-observation';
      }) => {
        const item = {
          id: `queue-${pendingMessages.length + 1}`,
          conversationId: input.conversationId,
          content: input.content,
          createdAt: input.now ?? 1000 + pendingMessages.length,
          source: input.source ?? 'composer',
        };
        pendingMessages.push(item);
        return item;
      },
    ),
    getPendingMessageQueue: vi.fn(() => pendingMessages.map((item) => ({ ...item }))),
    removePendingMessage: vi.fn(),
    updatePendingMessage: vi.fn(),
    promotePendingMessage: vi.fn(),
    getPendingMessagesCount: vi.fn(() => pendingMessages.length),
    dequeuePendingMessage: vi.fn(() => pendingMessages.shift() ?? null),
    drainPendingMessageQueue: vi.fn(() => pendingMessages.splice(0)),
    abort: vi.fn(),
    onDidRequestConfirmation: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidSubAgentEvent: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidRunnerEvent: vi.fn().mockImplementation((listener: typeof runnerEventListener) => {
      runnerEventListener = listener;
      return subAgentEventDisposable;
    }),
    emitSubAgentEvent: (event: SubAgentEvent) => runnerEventListener?.({ type: 'subagent', event }),
    emitRunnerEvent: (event: AgentRunnerPortEvent) => runnerEventListener?.(event),
    subAgentEventDisposable,
  };
}

/** Minimal IAgentManager-shaped object */
function createMockAgentManager(agentRunner = createMockAgentRunner()) {
  let queueSnapshotVersion = 0;
  return {
    getOrCreate: vi.fn().mockReturnValue(agentRunner),
    loadHistoryWithContext: vi.fn(),
    nextMessageQueueSnapshotVersion: vi.fn(() => {
      queueSnapshotVersion += 1;
      return queueSnapshotVersion;
    }),
    dispose: vi.fn(),
  };
}

/** Minimal Platform-shaped object */
function createMockPlatform() {
  return {
    config: {
      setRuntimeMediaDefaults: vi.fn(),
    },
    tools: { get: vi.fn() },
    service: { chat: vi.fn(), chatStream: vi.fn() },
  };
}

/**
 * Build an AgentMessageTurnHandler with sensible defaults, allowing per-test overrides.
 */
function buildHandler(
  overrides: {
    agentManager?: ReturnType<typeof createMockAgentManager> | undefined | null;
    platform?: ReturnType<typeof createMockPlatform> | undefined;
    providers?: ReturnType<typeof createMockProviders>;
    conversations?: ReturnType<typeof createMockConversations>;
    settings?: ReturnType<typeof createMockSettings>;
    isPlanMode?: boolean;
    localResourceAccess?: {
      toWebviewUri: ReturnType<typeof vi.fn>;
      toWebviewAsset?: ReturnType<typeof vi.fn>;
    };
    taskResultObservationCoordinator?: {
      handleTerminalTask: ReturnType<typeof vi.fn>;
    };
  } = {},
) {
  const settings = overrides.settings ?? createMockSettings();
  const providers = overrides.providers ?? createMockProviders(true);
  const conversations = overrides.conversations ?? createMockConversations();
  // Default: agentManager present unless explicitly set to null/undefined
  const agentManager =
    overrides.agentManager !== undefined ? overrides.agentManager : createMockAgentManager();
  const platform = overrides.platform !== undefined ? overrides.platform : createMockPlatform();

  return new AgentMessageTurnHandler(
    settings as any,
    providers as any,
    conversations as any,
    agentManager as any,
    undefined, // editorRegistry
    () => 'mock system prompt',
    () => overrides.isPlanMode ?? false,
    platform as any,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    overrides.localResourceAccess as any,
    overrides.taskResultObservationCoordinator
      ? { taskResultObservationCoordinator: overrides.taskResultObservationCoordinator as any }
      : {},
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentMessageTurnHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentStreamProcessorInstances.length = 0;
    (vscode.env as any).language = 'en';
    (vscode.workspace as any).workspaceFolders = undefined;
    vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(new Error('missing fixture'));
    vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);
    vi.mocked(vscode.workspace.asRelativePath).mockImplementation(
      (value: { fsPath?: string } | string) =>
        typeof value === 'string' ? value : (value.fsPath ?? ''),
    );
  });

  describe('provider expression target mapping', () => {
    it('maps agent media models to capability-specific targets', () => {
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

    it('maps a non-agent media model to image, video, and audio targets', () => {
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
  });

  describe('local resource access wiring', () => {
    it('passes local resource access into the stream processor for tool-result thumbnails', () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn(),
      };

      buildHandler({ localResourceAccess });

      expect(agentStreamProcessorInstances).toHaveLength(1);
      expect(agentStreamProcessorInstances[0]!.deps.localResourceAccess).toBe(localResourceAccess);
    });
  });

  describe('Agent-first Skill activation boundary', () => {
    it('dispatches natural-language agent turns without pre-turn Skill injection', async () => {
      const webview = createMockWebview();
      const agentManager = createMockAgentManager();
      const handler = buildHandler({
        agentManager,
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('生成分镜表', { conversationId: 'conv-1' }),
      );

      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'skillInjection' }),
      );
      expect(agentManager.getOrCreate().execute).toHaveBeenCalled();
    });

    it('propagates the host locale from the sent user message into runner configuration', async () => {
      (vscode.env as any).language = 'zh-CN';
      const webview = createMockWebview();
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        agentManager,
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('继续生成中文分镜表', { conversationId: 'conv-1' }),
      );

      expect(agentRunner.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          locale: 'zh',
        }),
      );
      expect(agentRunner.execute).toHaveBeenCalledWith('继续生成中文分镜表', expect.anything());
    });
  });

  describe('IDC plan mode wiring', () => {
    it('configures the agent in plan execution mode when prompt plan mode is active', async () => {
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        agentManager,
        providers: createMockProviders(true),
        isPlanMode: true,
      });

      await handler.handleUserMessage(
        createMockWebview() as any,
        createChatModelRequest('outline the rollout'),
      );

      expect(agentRunner.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          executionMode: 'plan',
        }),
      );
    });

    it('passes explicit IDC turn metadata when prompt plan mode is active', async () => {
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        agentManager,
        providers: createMockProviders(true),
        isPlanMode: true,
      });

      await handler.handleUserMessage(
        createMockWebview() as any,
        createChatModelRequest('outline the rollout'),
      );

      expect(agentRunner.execute).toHaveBeenCalledWith(
        'outline the rollout',
        expect.objectContaining({
          metadata: expect.objectContaining({
            agentCreation: expect.objectContaining({
              entrySignal: 'vague-creative',
              taskShape: 'multi-step',
              creationKind: 'plan-mode',
            }),
          }),
        }),
      );
    });
  });

  describe('Agent LLM composer configuration', () => {
    it('uses the DeepSeek direct default after config reload clears stale gateway selection', async () => {
      const settings = createMockSettings();
      settings.selectedProviderId = 'deepseek-chat';
      settings.selectedModelId = 'deepseek-v4-pro';
      const providers = createDeepSeekProvidersWithGatewayCandidate();
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        settings,
        providers,
        agentManager,
      });

      await handler.handleUserMessage(createMockWebview() as any, createMessageRequest('hello'));

      expect(agentRunner.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'deepseek-chat',
          modelId: 'deepseek-v4-pro',
          modelCapabilities: ['chat', 'streaming'],
        }),
      );
      expect(providers.getProvider).not.toHaveBeenCalledWith('nekoapi-chat');
    });

    it('rejects missing explicit chat selection instead of using gateway defaults', async () => {
      const webview = createMockWebview();
      const providers = createDeepSeekProvidersWithGatewayCandidate();
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        settings: createMockSettings(),
        providers,
        agentManager,
      });

      await handler.handleUserMessage(webview as any, createMessageRequest('hello'));

      expect(agentRunner.configure).not.toHaveBeenCalled();
      expect(agentRunner.execute).not.toHaveBeenCalled();
      expect(providers.getDefaultProvider).not.toHaveBeenCalled();
      expect(providers.getProvider).not.toHaveBeenCalledWith('nekoapi-chat');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'globalError',
          message: expect.stringContaining('No Agent primary model is selected'),
        }),
      );
    });

    it('rejects partial runtime chat selection instead of inferring provider defaults', async () => {
      const webview = createMockWebview();
      const settings = createMockSettings();
      settings.selectedProviderId = 'deepseek-chat';
      const providers = createDeepSeekProvidersWithGatewayCandidate();
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        settings,
        providers,
        agentManager,
      });

      await handler.handleUserMessage(webview as any, createMessageRequest('hello'));

      expect(agentRunner.configure).not.toHaveBeenCalled();
      expect(agentRunner.execute).not.toHaveBeenCalled();
      expect(providers.getProvider).not.toHaveBeenCalledWith('deepseek-chat');
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'globalError',
          message: expect.stringContaining('selection is incomplete'),
        }),
      );
    });

    it('uses Agent primary model and projected LLM runtime options for the turn', async () => {
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        agentManager,
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        createMockWebview() as any,
        createMessageRequest('draft the scene', {
          agentModels: {
            primary: { providerId: 'anthropic', modelId: 'claude-3', category: 'llm' },
          },
          llmConfig: {
            reasoningPreset: 'balanced',
            advanced: { maxOutputTokens: 2048 },
          },
        }),
      );

      expect(agentRunner.configure).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'claude-3',
          maxTokens: 2048,
          thinkingBudget: 4096,
          providerOptions: {
            anthropic: {
              thinking: {
                type: 'enabled',
                budgetTokens: 4096,
              },
            },
          },
        }),
      );
    });

    it('queues a same-config Agent message while the runner is already processing', async () => {
      const webview = createMockWebview();
      const platform = createMockPlatform();
      const providers = createMockProviders(true);
      const conversations = createMockConversations();
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      vi.mocked(agentRunner.isRunning).mockReturnValue(true);
      vi.mocked(agentRunner.getConfig).mockReturnValue({
        platform,
        systemPrompt: 'mock system prompt',
        maxIterations: 200,
        autoExecuteTools: true,
        temperature: 0.7,
        maxTokens: 8192,
        providerId: 'anthropic',
        modelId: 'claude-3',
        modelCapabilities: ['chat', 'thinking', 'sampling'],
        executionMode: 'ask',
        conversationId: 'conv-1',
      });
      const handler = buildHandler({
        agentManager,
        providers,
        platform,
        conversations,
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('继续', { conversationId: 'conv-1' }),
      );

      expect(agentRunner.enqueuePendingMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: 'conv-1',
          content: '继续',
        }),
      );
      expect(agentRunner.configure).not.toHaveBeenCalled();
      expect(agentRunner.execute).not.toHaveBeenCalled();
      expect(conversations.removeMessageFromConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.any(String),
      );
      expect(conversations.getMessages()).toEqual([]);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'messageQueued',
          conversationId: 'conv-1',
          pendingCount: 1,
          item: expect.objectContaining({ id: 'queue-1', content: '继续' }),
          snapshot: expect.objectContaining({
            conversationId: 'conv-1',
            pendingCount: 1,
            items: [expect.objectContaining({ id: 'queue-1', content: '继续' })],
          }),
        }),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          message: expect.stringContaining('Agent configuration cannot change'),
        }),
      );
    });

    it('persists a released queued item when the queued turn begins executing', async () => {
      const webview = createMockWebview();
      const platform = createMockPlatform();
      const providers = createMockProviders(true);
      const conversations = createMockConversations();
      const agentRunner = createMockAgentRunner();
      vi.mocked(agentRunner.dequeuePendingMessage)
        .mockReturnValueOnce({
          id: 'queue-1',
          conversationId: 'conv-1',
          content: '继续润色',
          createdAt: 456,
          source: 'composer',
        })
        .mockReturnValueOnce(null);
      vi.mocked(agentRunner.getPendingMessageQueue).mockReturnValue([]);
      const agentManager = createMockAgentManager(agentRunner);
      const handler = buildHandler({
        agentManager,
        providers,
        platform,
        conversations,
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('开始生成', { conversationId: 'conv-1' }),
      );

      expect(conversations.upsertMessageToConversation).toHaveBeenCalledWith('conv-1', {
        id: 'released:queue-1',
        role: 'user',
        content: '继续润色',
        timestamp: 456,
      });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'messageQueued',
          conversationId: 'conv-1',
          pendingCount: 0,
          releasedItem: expect.objectContaining({ id: 'queue-1', content: '继续润色' }),
          snapshot: expect.objectContaining({
            pendingCount: 0,
            items: [],
          }),
        }),
      );
    });

    it('rejects unsupported Agent model slots before dispatching the turn', async () => {
      const webview = createMockWebview();
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        agentManager,
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        webview as any,
        createMessageRequest('draft the scene', {
          agentModels: {
            primary: { providerId: 'anthropic', modelId: 'claude-3', category: 'llm' },
            fast: { providerId: 'anthropic', modelId: 'claude-3', category: 'llm' },
          },
        }),
      );

      expect(agentRunner.configure).not.toHaveBeenCalled();
      expect(agentRunner.execute).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'globalError',
          message: expect.stringContaining('supports only the primary slot'),
        }),
      );
    });

    it('rejects conflicting chatModel and Agent primary model selections', async () => {
      const webview = createMockWebview();
      const agentManager = createMockAgentManager();
      const agentRunner = agentManager.getOrCreate();
      const handler = buildHandler({
        agentManager,
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('draft the scene', {
          agentModels: {
            primary: { providerId: 'anthropic', modelId: 'other-model', category: 'llm' },
          },
        }),
      );

      expect(agentRunner.configure).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'globalError',
          message: expect.stringContaining('conflicts with the chat model selection'),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // getAgentStateSnapshot
  // -------------------------------------------------------------------------

  describe('getAgentStateSnapshot()', () => {
    it('returns an empty array initially', () => {
      const handler = buildHandler();
      expect(handler.getAgentStateSnapshot()).toEqual([]);
    });

    it('still returns an array after a conversation is cleared', () => {
      const handler = buildHandler();
      // clearAgentState on a non-existent key should not throw
      handler.clearAgentState('nonexistent');
      expect(handler.getAgentStateSnapshot()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // clearAgentState
  // -------------------------------------------------------------------------

  describe('clearAgentState()', () => {
    it('does not throw for a nonexistent conversationId', () => {
      const handler = buildHandler();
      expect(() => handler.clearAgentState('no-such-id')).not.toThrow();
    });

    it('is idempotent — calling twice does not throw', () => {
      const handler = buildHandler();
      handler.clearAgentState('conv-abc');
      handler.clearAgentState('conv-abc');
      expect(handler.getAgentStateSnapshot()).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // handleUserMessage — thinking indicator
  // -------------------------------------------------------------------------

  describe('handleUserMessage() — thinking indicator', () => {
    it('posts a thinking message before executing', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();

      await handler.handleUserMessage(webview as any, createChatModelRequest('hello'));

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
      }>;
      const hasThinking = calls.some((msg) => msg.type === 'thinking');
      expect(hasThinking).toBe(true);
    });

    it('posts thinking before any other messages', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();

      await handler.handleUserMessage(webview as any, createChatModelRequest('hello'));

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
      }>;
      expect(calls[0]?.type).toBe('thinking');
    });
  });

  // -------------------------------------------------------------------------
  // handleUserMessage — conversationId binding
  // -------------------------------------------------------------------------

  describe('handleUserMessage() — conversationId', () => {
    it('uses provided conversationId and does not call ensureActive', async () => {
      const webview = createMockWebview();
      const conversations = createMockConversations();
      const handler = buildHandler({ conversations });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('hi', { conversationId: 'provided-conv-id' }),
      );

      // ensureActive should NOT have been called when a conversationId is provided
      expect(conversations.ensureActive).not.toHaveBeenCalled();
    });

    it('rejects the message when no conversationId is provided', async () => {
      const webview = createMockWebview();
      const conversations = createMockConversations();
      const handler = buildHandler({ conversations });

      await handler.handleUserMessage(
        webview as any,
        createMessageRequest('hi', { conversationId: '' }),
      );

      expect(conversations.ensureActive).not.toHaveBeenCalled();
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'globalError' }),
      );
    });

    it('thinking message includes the correct conversationId', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('hello', { conversationId: 'my-conv' }),
      );

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
        conversationId?: string;
      }>;
      const thinkingMsg = calls.find((msg) => msg.type === 'thinking');
      expect(thinkingMsg?.conversationId).toBe('my-conv');
    });
  });

  // -------------------------------------------------------------------------
  // handleUserMessage — fallback response (no agentManager)
  // -------------------------------------------------------------------------

  describe('handleUserMessage() — fallback when no agentManager', () => {
    it('posts an error message when agentManager is undefined', async () => {
      const webview = createMockWebview();
      const conversations = createMockConversations();
      const handler = buildHandler({ agentManager: null, conversations });

      await handler.handleUserMessage(webview as any, createChatModelRequest('hello'));

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
        conversationId?: string;
      }>;
      expect(calls).toContainEqual(
        expect.objectContaining({ type: 'error', conversationId: 'conv-1' }),
      );
      expect(conversations.addMessageToConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({ role: 'assistant', isError: true }),
      );
    });

    it('does not throw when agentManager is undefined', async () => {
      const webview = createMockWebview();
      const handler = buildHandler({ agentManager: null });

      await expect(
        handler.handleUserMessage(webview as any, createChatModelRequest('hello')),
      ).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // handleUserMessage — fallback when no configured provider
  // -------------------------------------------------------------------------

  describe('handleUserMessage() — fallback when no configured provider', () => {
    it('returns a visible boundary diagnostic when no primary model can be resolved', async () => {
      const webview = createMockWebview();
      const conversations = createMockConversations();
      // providers returns undefined (not configured)
      const handler = buildHandler({ providers: createMockProviders(false), conversations });

      await handler.handleUserMessage(webview as any, createMessageRequest('hello'));

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
        message?: string;
      }>;
      expect(calls).toContainEqual(
        expect.objectContaining({
          type: 'globalError',
          message: expect.stringContaining('No Agent primary model is selected'),
        }),
      );
      expect(conversations.addMessageToConversation).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleUserMessage — user message stored
  // -------------------------------------------------------------------------

  describe('handleUserMessage() — user message persistence', () => {
    it('stores the user message in conversations', async () => {
      const webview = createMockWebview();
      const conversations = createMockConversations();
      const handler = buildHandler({ conversations });

      await handler.handleUserMessage(webview as any, createChatModelRequest('test message'));

      expect(conversations.addMessageToConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ role: 'user', content: 'test message' }),
      );
    });

    it('does not store hidden task-result follow-up prompts as user messages', async () => {
      const webview = createMockWebview();
      const conversations = createMockConversations();
      const agentRunner = createMockAgentRunner();
      const handler = buildHandler({
        conversations,
        agentManager: createMockAgentManager(agentRunner),
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('Continue from the completed async task result.', {
          userMessageVisibility: 'hidden',
        }),
      );

      expect(conversations.addMessageToConversation).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          role: 'user',
          content: 'Continue from the completed async task result.',
        }),
      );
      expect(agentRunner.execute).toHaveBeenCalledWith(
        'Continue from the completed async task result.',
        expect.any(Object),
      );
    });
  });

  describe('handleUserMessage() — SubAgent event bridge', () => {
    it('forwards activation progress events for the subscribed conversation', async () => {
      const webview = createMockWebview();
      const agentRunner = createMockAgentRunner();
      const handler = buildHandler({
        agentManager: createMockAgentManager(agentRunner),
        providers: createMockProviders(true),
      });
      const intent = createAgentCapabilityActivationIntent({
        conversationId: 'conv-1',
        source: 'agent-tool',
        target: 'skill',
        action: 'activate',
        name: 'quality-review',
        requestedBy: 'agent',
        createdAt: 100,
      });
      const event = createAgentCapabilityActivationProgressEvent({
        intent,
        step: 'requested',
        status: 'succeeded',
        at: 101,
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('start activation', { conversationId: 'conv-1' }),
      );

      agentRunner.emitRunnerEvent({
        type: 'activationProgress',
        conversationId: 'conv-1',
        events: [event],
      });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'agentCapabilityActivationProgress',
        conversationId: 'conv-1',
        events: [event],
      });
    });

    it('forwards SubAgent events for the subscribed conversation', async () => {
      const webview = createMockWebview();
      const agentRunner = createMockAgentRunner();
      const handler = buildHandler({
        agentManager: createMockAgentManager(agentRunner),
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('start subagent task', { conversationId: 'conv-1' }),
      );

      agentRunner.emitSubAgentEvent({
        type: 'progress',
        subAgentId: 'sub-1',
        parentAgentId: 'agent-1',
        conversationId: 'conv-1',
        data: {
          status: 'running',
          progress: 'reading files',
        },
        timestamp: 100,
      });

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'subagentEvent',
        conversationId: 'conv-1',
        event: expect.objectContaining({
          type: 'progress',
          subAgentId: 'sub-1',
          conversationId: 'conv-1',
        }),
        workItem: expect.objectContaining({
          id: 'sub-1',
          conversationId: 'conv-1',
          kind: 'subagent',
        }),
      });
    });

    it('projects terminal SubAgent events to task-result observation coordinator', async () => {
      const webview = createMockWebview();
      const agentRunner = createMockAgentRunner();
      const taskResultObservationCoordinator = {
        handleTerminalTask: vi.fn(async () => undefined),
      };
      const handler = buildHandler({
        agentManager: createMockAgentManager(agentRunner),
        providers: createMockProviders(true),
        taskResultObservationCoordinator,
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('start subagent task', { conversationId: 'conv-1' }),
      );

      agentRunner.emitSubAgentEvent({
        type: 'completed',
        subAgentId: 'sub-1',
        parentAgentId: 'agent-1',
        conversationId: 'conv-1',
        data: {
          runId: 'run-subagent',
          runStartedAt: 101,
          parentMessageId: 'msg-1',
          parentToolCallId: 'tool-1',
          result: { response: 'done' },
        },
        timestamp: 100,
      });

      expect(taskResultObservationCoordinator.handleTerminalTask).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sub-1',
          status: 'completed',
          lifecycle: expect.objectContaining({
            ownerConversationId: 'conv-1',
            ownerRunId: 'run-subagent',
            ownerRunStartedAt: 101,
          }),
        }),
        {
          source: 'subagent',
          parentMessageId: 'msg-1',
          parentToolCallId: 'tool-1',
        },
      );
    });

    it('does not forward SubAgent events from another conversation', async () => {
      const webview = createMockWebview();
      const agentRunner = createMockAgentRunner();
      const handler = buildHandler({
        agentManager: createMockAgentManager(agentRunner),
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('start subagent task', { conversationId: 'conv-1' }),
      );

      agentRunner.emitSubAgentEvent({
        type: 'started',
        subAgentId: 'sub-2',
        parentAgentId: 'agent-2',
        conversationId: 'conv-2',
        timestamp: 200,
      });

      const subAgentMessages = webview.postMessage.mock.calls
        .map((call: unknown[]) => call[0])
        .filter((message: unknown): message is { type: string } => {
          return (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            (message as { type?: unknown }).type === 'subagentEvent'
          );
        });
      expect(subAgentMessages).toEqual([]);
    });

    it('does not record terminal SubAgent observations from another conversation', async () => {
      const webview = createMockWebview();
      const agentRunner = createMockAgentRunner();
      const taskResultObservationCoordinator = {
        handleTerminalTask: vi.fn(async () => undefined),
      };
      const handler = buildHandler({
        agentManager: createMockAgentManager(agentRunner),
        providers: createMockProviders(true),
        taskResultObservationCoordinator,
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('start subagent task', { conversationId: 'conv-1' }),
      );

      agentRunner.emitSubAgentEvent({
        type: 'completed',
        subAgentId: 'sub-2',
        parentAgentId: 'agent-2',
        conversationId: 'conv-2',
        data: {
          runId: 'run-subagent-2',
          result: { response: 'done' },
        },
        timestamp: 200,
      });

      expect(taskResultObservationCoordinator.handleTerminalTask).not.toHaveBeenCalled();
    });

    it('disposes the SubAgent event subscription when clearing agent state', async () => {
      const webview = createMockWebview();
      const agentRunner = createMockAgentRunner();
      const handler = buildHandler({
        agentManager: createMockAgentManager(agentRunner),
        providers: createMockProviders(true),
      });

      await handler.handleUserMessage(
        webview as any,
        createChatModelRequest('start subagent task', { conversationId: 'conv-1' }),
      );
      handler.clearAgentState('conv-1');

      expect(agentRunner.subAgentEventDisposable.dispose).toHaveBeenCalledTimes(1);

      agentRunner.emitSubAgentEvent({
        type: 'completed',
        subAgentId: 'sub-1',
        parentAgentId: 'agent-1',
        conversationId: 'conv-1',
        timestamp: 300,
      });

      const subAgentMessages = webview.postMessage.mock.calls
        .map((call: unknown[]) => call[0])
        .filter((message: unknown): message is { type: string } => {
          return (
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            (message as { type?: unknown }).type === 'subagentEvent'
          );
        });
      expect(subAgentMessages).toEqual([]);
    });
  });

  describe('searchProjectFiles()', () => {
    it('uses an agent runtime search/projection plan and preserves conversationId', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();

      (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
        { fsPath: '/workspace/src/app.ts' },
      ] as any);
      vi.mocked(vscode.workspace.asRelativePath).mockImplementation((value: any) =>
        String(value.fsPath).replace('/workspace/', ''),
      );

      await handler.searchProjectFiles(webview as any, 'app', 'conv-search');

      expect(vscode.workspace.findFiles).toHaveBeenCalledWith(
        '**/*app*',
        DEFAULT_MENTION_EXCLUDE_GLOB,
        120,
      );
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'projectFiles',
        conversationId: 'conv-search',
        filter: 'app',
        files: [
          {
            path: 'src/app.ts',
            name: 'app.ts',
            type: 'file',
            source: 'workspace',
            icon: 'TS',
          },
        ],
        mentionExtras: [],
      });
    });

    it('projects search/entity thumbnails after upstream search resolves candidates', async () => {
      const webview = createMockWebview();
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, source: string) => `webview:${source}`),
      };
      const handler = buildHandler({ localResourceAccess });

      (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      vi.mocked(vscode.commands.executeCommand).mockImplementation(async (command: string) => {
        if (command === 'neko.assets.contractPath') {
          return '${FOOTAGE}/hero-shot.mp4';
        }
        return {
          items: [
            {
              id: 'asset:asset-hero',
              kind: 'asset',
              label: 'Hero portrait',
              description: 'Asset',
              icon: 'IMG',
              source: {
                partition: 'asset-library',
                sourceId: 'asset-hero',
                sourceKind: 'character',
              },
              projectRoot: '/workspace',
              filePath: 'assets/hero.png',
              thumbnailUri: '/workspace/thumbs/hero.png',
              searchText: 'Hero portrait',
              freshness: 'fresh',
              metadata: { mediaType: 'image', entityType: 'character' },
            },
            {
              id: 'media:/library/hero-shot.mp4',
              kind: 'media',
              label: 'hero-shot.mp4',
              description: 'Footage',
              source: {
                partition: 'media-library',
                sourceId: '/library/hero-shot.mp4',
                sourceKind: 'video',
              },
              projectRoot: '/workspace',
              filePath: '/library/hero-shot.mp4',
              thumbnailUri: '/library/thumbs/hero-shot.jpg',
              searchText: 'hero-shot',
              freshness: 'fresh',
              metadata: { mediaType: 'video' },
              navigationData: { filePath: '/library/hero-shot.mp4' },
            },
            {
              id: 'entity:char-hero',
              kind: 'creative-entity',
              label: 'Hero',
              description: 'Character',
              source: {
                partition: 'creative-entities',
                sourceId: 'char-hero',
                sourceKind: 'character',
              },
              projectRoot: '/workspace',
              thumbnailUri: '/workspace/entities/hero.png',
              searchText: 'Hero character',
              freshness: 'fresh',
              metadata: { entityType: 'character' },
            },
          ],
          partitions: [],
          freshness: 'fresh',
          context: { projectRoot: '/workspace' },
          query: { text: 'hero' },
        };
      });

      await handler.searchProjectFiles(webview as any, 'hero', 'conv-search');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'neko.projectSearch.query',
        expect.objectContaining({
          text: 'hero',
          mode: 'mention',
          kinds: expect.arrayContaining(['asset', 'media', 'creative-entity']),
        }),
      );
      expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith({
        fsPath: '/workspace/.gitignore',
      });
      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        '/workspace/thumbs/hero.png',
        'neko-agent.project-search-thumbnail',
      );
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'projectFiles',
        conversationId: 'conv-search',
        filter: 'hero',
        files: [],
        mentionExtras: expect.arrayContaining([
          expect.objectContaining({
            type: 'asset',
            id: 'asset:asset-hero',
            label: 'Hero portrait',
            source: 'asset-library',
            mediaType: 'image',
            filePath: 'assets/hero.png',
            thumbnailUri: 'webview:/workspace/thumbs/hero.png',
          }),
          expect.objectContaining({
            type: 'media',
            id: 'media:/library/hero-shot.mp4',
            label: 'hero-shot.mp4',
            source: 'media-library',
            mediaType: 'video',
            filePath: '${FOOTAGE}/hero-shot.mp4',
            navigationData: expect.objectContaining({
              filePath: '${FOOTAGE}/hero-shot.mp4',
              portablePath: '${FOOTAGE}/hero-shot.mp4',
              resolvedPath: '/library/hero-shot.mp4',
            }),
            thumbnailUri: 'webview:/library/thumbs/hero-shot.jpg',
          }),
          expect.objectContaining({
            type: 'entity',
            id: 'entity:char-hero',
            label: 'Hero',
            source: 'entity-graph',
            entityType: 'character',
            thumbnailUri: 'webview:/workspace/entities/hero.png',
          }),
        ]),
      });
    });

    it('uses a roleplay-scoped candidate search without scanning workspace files', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();

      (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
        items: [
          {
            id: 'entity:char-xiaoju',
            kind: 'creative-entity',
            label: '小橘',
            description: 'Character',
            source: {
              partition: 'creative-entities',
              sourceId: 'char-xiaoju',
              sourceKind: 'character',
            },
            projectRoot: '/workspace',
            searchText: '小橘 character',
            freshness: 'fresh',
            metadata: { entityType: 'character' },
          },
        ],
        partitions: [],
        freshness: 'fresh',
        context: { projectRoot: '/workspace' },
        query: { text: '' },
      });

      await handler.searchProjectFiles(webview as any, '', 'conv-search', {
        purpose: 'roleplay',
      });

      expect(vscode.workspace.findFiles).not.toHaveBeenCalled();
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'neko.projectSearch.query',
        expect.objectContaining({
          text: '',
          mode: 'mention',
          kinds: ['script-role', 'creative-entity', 'entity-candidate', 'asset', 'generated-asset'],
          partitions: ['story-symbols', 'creative-entities', 'asset-library'],
        }),
      );
      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'projectFiles',
        conversationId: 'conv-search',
        filter: '',
        purpose: 'roleplay',
        files: [],
        mentionExtras: [
          expect.objectContaining({
            type: 'entity',
            id: 'entity:char-xiaoju',
            label: '小橘',
            entityType: 'character',
          }),
        ],
      });
    });

    it('passes the last active text editor as project search context', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();
      const editorListener = vi.mocked(vscode.window.onDidChangeActiveTextEditor).mock
        .calls[0]?.[0] as ((editor: unknown) => void) | undefined;
      editorListener?.({
        document: {
          uri: {
            fsPath: '/workspace/cases/test.fountain',
            toString: () => 'file:///workspace/cases/test.fountain',
          },
        },
      });
      (vscode.window as any).activeTextEditor = undefined;
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
        items: [],
        partitions: [],
        freshness: 'fresh',
        context: { projectRoot: '/workspace' },
        query: { text: '小橘' },
      });

      await handler.searchProjectFiles(webview as any, '小橘', 'conv-search');

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'neko.projectSearch.query',
        expect.objectContaining({
          text: '小橘',
          contextFilePath: '/workspace/cases/test.fountain',
          contextUri: 'file:///workspace/cases/test.fountain',
        }),
      );
    });

    it('uses the conversation workspace hash for mention search in multi-root workspaces', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();
      const targetProjectRoot = '/workspace/neko-test';
      const conversationId = `${getConversationWorkDirHash(targetProjectRoot)}-01JTEST0000000000000000000`;
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: '/workspace/neko-suite' } },
        { uri: { fsPath: targetProjectRoot } },
      ];
      (vscode.window as any).activeTextEditor = undefined;
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
        items: [],
        partitions: [],
        freshness: 'fresh',
        context: { projectRoot: targetProjectRoot },
        query: { text: '灯神' },
      });

      await handler.searchProjectFiles(webview as any, '灯神', conversationId);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'neko.projectSearch.query',
        expect.objectContaining({
          text: '灯神',
          projectRoot: targetProjectRoot,
        }),
      );
    });

    it('prefers the active editor workspace over an older conversation hash', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();
      const staleProjectRoot = '/workspace/neko-suite';
      const targetProjectRoot = '/workspace/neko-test';
      const staleConversationId = `${getConversationWorkDirHash(staleProjectRoot)}-01JTEST0000000000000000000`;
      (vscode.workspace as any).workspaceFolders = [
        { uri: { fsPath: staleProjectRoot } },
        { uri: { fsPath: targetProjectRoot } },
      ];
      (vscode.window as any).activeTextEditor = {
        document: {
          uri: {
            fsPath: `${targetProjectRoot}/config.toml`,
            toString: () => `file://${targetProjectRoot}/config.toml`,
          },
        },
      };
      vi.mocked(vscode.commands.executeCommand).mockResolvedValue({
        items: [],
        partitions: [],
        freshness: 'fresh',
        context: { projectRoot: targetProjectRoot },
        query: { text: '灯神' },
      });

      await handler.searchProjectFiles(webview as any, '灯神', staleConversationId);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'neko.projectSearch.query',
        expect.objectContaining({
          text: '灯神',
          contextFilePath: `${targetProjectRoot}/config.toml`,
          contextUri: `file://${targetProjectRoot}/config.toml`,
          projectRoot: targetProjectRoot,
        }),
      );
    });
  });
});
