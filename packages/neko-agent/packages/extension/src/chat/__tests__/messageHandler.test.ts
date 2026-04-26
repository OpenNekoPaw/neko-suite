import { describe, it, expect, vi, beforeEach } from 'vitest';

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
import { MessageHandler, buildProviderExpressionTargets } from '../messageHandler';

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

// Mock @neko/platform module
vi.mock('@neko/platform', () => ({}));

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
      processStream = vi.fn().mockResolvedValue({
        accumulatedResponse: 'mock response',
        accumulatedThinking: '',
        collectedToolCalls: [],
        contentBlocks: [],
        hasError: false,
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
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
  const provider = isConfigured ? { id: 'anthropic', isConfigured: true, models: [] } : undefined;
  return {
    getProvider: vi.fn().mockReturnValue(provider),
    getDefaultProvider: vi.fn().mockReturnValue(provider),
  };
}

/** Minimal ConversationHandler-shaped object */
function createMockConversations() {
  const msgs: unknown[] = [];
  return {
    ensureActive: vi.fn().mockReturnValue('conv-1'),
    addMessageToConversation: vi.fn((_id: string, msg: unknown) => msgs.push(msg)),
    addMessage: vi.fn(),
    getActiveId: vi.fn().mockReturnValue('conv-1'),
    get: vi.fn().mockReturnValue({ id: 'conv-1', messages: msgs }),
    manager: {
      toAgentHistory: vi.fn().mockReturnValue([]),
    },
  };
}

/** Minimal IAgentRunner — returned by agentManager.getOrCreate */
function createMockAgentRunner() {
  return {
    getHistory: vi.fn().mockReturnValue([]),
    configure: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockReturnValue((async function* () {})()),
    abort: vi.fn(),
    onDidRequestConfirmation: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };
}

/** Minimal IAgentManager-shaped object */
function createMockAgentManager() {
  return {
    getOrCreate: vi.fn().mockReturnValue(createMockAgentRunner()),
    loadHistoryWithContext: vi.fn(),
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
 * Build a MessageHandler with sensible defaults, allowing per-test overrides.
 */
function buildHandler(
  overrides: {
    agentManager?: ReturnType<typeof createMockAgentManager> | undefined | null;
    platform?: ReturnType<typeof createMockPlatform> | undefined;
    providers?: ReturnType<typeof createMockProviders>;
    conversations?: ReturnType<typeof createMockConversations>;
    settings?: ReturnType<typeof createMockSettings>;
    isPlanMode?: boolean;
  } = {},
) {
  const settings = overrides.settings ?? createMockSettings();
  const providers = overrides.providers ?? createMockProviders();
  const conversations = overrides.conversations ?? createMockConversations();
  // Default: agentManager present unless explicitly set to null/undefined
  const agentManager =
    overrides.agentManager !== undefined ? overrides.agentManager : createMockAgentManager();
  const platform = overrides.platform !== undefined ? overrides.platform : createMockPlatform();

  return new MessageHandler(
    settings as any,
    providers as any,
    conversations as any,
    agentManager as any,
    undefined, // editorRegistry
    () => 'mock system prompt',
    () => overrides.isPlanMode ?? false,
    platform as any,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MessageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('provider expression target mapping', () => {
    it('maps agent media models to capability-specific targets', () => {
      expect(
        buildProviderExpressionTargets(
          {
            image: { providerId: 'flux', modelId: 'flux-pro-1.1' },
            video: { providerId: 'runway', modelId: 'gen-4' },
          },
          undefined,
          undefined,
        ),
      ).toEqual([
        { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro-1.1' },
        { capability: 'video.generate', providerId: 'runway', modelId: 'gen-4' },
      ]);
    });

    it('maps a non-agent media model to image, video, and audio targets', () => {
      expect(buildProviderExpressionTargets(undefined, 'openai', 'gpt-image-1')).toEqual([
        { capability: 'image.generate', providerId: 'openai', modelId: 'gpt-image-1' },
        { capability: 'video.generate', providerId: 'openai', modelId: 'gpt-image-1' },
        { capability: 'audio.generate', providerId: 'openai', modelId: 'gpt-image-1' },
      ]);
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

      await handler.handleUserMessage(createMockWebview() as any, 'outline the rollout');

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

      await handler.handleUserMessage(createMockWebview() as any, 'outline the rollout');

      expect(agentRunner.execute).toHaveBeenCalledWith(
        'outline the rollout',
        expect.objectContaining({
          metadata: {
            idc: {
              entrySignal: 'vague-creative',
              taskShape: 'multi-step',
              runKind: 'plan-mode',
              workflowId: 'plan-mode',
            },
          },
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

      await handler.handleUserMessage(webview as any, 'hello');

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
      }>;
      const hasThinking = calls.some((msg) => msg.type === 'thinking');
      expect(hasThinking).toBe(true);
    });

    it('posts thinking before any other messages', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();

      await handler.handleUserMessage(webview as any, 'hello');

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
        'hi',
        undefined,
        undefined,
        undefined,
        undefined,
        'provided-conv-id',
      );

      // ensureActive should NOT have been called when a conversationId is provided
      expect(conversations.ensureActive).not.toHaveBeenCalled();
    });

    it('calls ensureActive when no conversationId is provided', async () => {
      const webview = createMockWebview();
      const conversations = createMockConversations();
      const handler = buildHandler({ conversations });

      await handler.handleUserMessage(webview as any, 'hi');

      expect(conversations.ensureActive).toHaveBeenCalled();
    });

    it('thinking message includes the correct conversationId', async () => {
      const webview = createMockWebview();
      const handler = buildHandler();

      await handler.handleUserMessage(
        webview as any,
        'hello',
        undefined,
        undefined,
        undefined,
        undefined,
        'my-conv',
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
      const handler = buildHandler({ agentManager: undefined });

      await handler.handleUserMessage(webview as any, 'hello');

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
      }>;
      const hasError = calls.some((msg) => msg.type === 'error');
      expect(hasError).toBe(true);
    });

    it('does not throw when agentManager is undefined', async () => {
      const webview = createMockWebview();
      const handler = buildHandler({ agentManager: undefined });

      await expect(handler.handleUserMessage(webview as any, 'hello')).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // handleUserMessage — fallback when no configured provider
  // -------------------------------------------------------------------------

  describe('handleUserMessage() — fallback when no configured provider', () => {
    it('posts an error message when provider is not configured', async () => {
      const webview = createMockWebview();
      // providers returns undefined (not configured)
      const handler = buildHandler({ providers: createMockProviders(false) });

      await handler.handleUserMessage(webview as any, 'hello');

      const calls = webview.postMessage.mock.calls.map((c: unknown[]) => c[0]) as Array<{
        type: string;
      }>;
      const hasError = calls.some((msg) => msg.type === 'error');
      expect(hasError).toBe(true);
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

      await handler.handleUserMessage(webview as any, 'test message');

      expect(conversations.addMessageToConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ role: 'user', content: 'test message' }),
      );
    });
  });
});
