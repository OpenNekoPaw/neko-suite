import { describe, expect, it, vi } from 'vitest';
import type { WebviewToExtensionMessage } from '@neko-agent/types';
import { createAgentHostRouteCoverageDiagnostics } from '@neko-agent/types/agent-host-runtime-adapter';
import {
  NEKO_COMMANDS,
  createNekoCommandRegistry,
  type NekoCommandExecutor,
  type NekoWorkspaceSearchFilesResult,
} from '@neko/host';
import type { AssistantConfigState, AssistantSettingsData } from '@neko/platform/config/index';
import { DESKTOP_AGENT_RUNTIME_IDS } from '../shared/contracts';
import type {
  DesktopAgentConfigManager,
  DesktopAgentConversationRuntimeStorage,
  DesktopAgentConversationRuntimeStorageSnapshot,
  DesktopAgentSnapshotRuntime,
  DesktopAgentWebviewHostDeps,
} from './agent-webview-host';
import {
  DESKTOP_AGENT_HOST_ROUTE_SUPPORT,
  InMemoryDesktopAgentConversationRuntime,
  InMemoryDesktopAgentSnapshotRuntime,
  handleDesktopAgentWebviewMessage,
  handleRawDesktopAgentRuntimeMessageRequest,
} from './agent-webview-host';

describe('desktop Agent webview host', () => {
  it('projects platform Agent config into the package webview protocol', async () => {
    const deps = createDeps();

    const messages = await handleDesktopAgentWebviewMessage(
      { type: 'refreshConfigSnapshot' },
      deps,
    );

    expect(deps.getConfigManager().reloadConfig).toHaveBeenCalledTimes(1);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      type: 'settingsData',
      selectedProviderId: 'nekoapi-chat',
      selectedModelId: 'gpt-5.5',
      providers: [
        {
          id: 'nekoapi-chat',
          name: 'Neko API',
          isConfigured: true,
          models: [{ id: 'gpt-5.5', name: 'GPT 5.5', description: '' }],
        },
      ],
      configuredProviders: [
        {
          id: 'nekoapi-chat',
          type: 'openai-compatible',
          models: [{ id: 'gpt-5.5', name: 'GPT 5.5', enabled: true }],
        },
      ],
      chatModelOptions: [
        {
          id: 'nekoapi-chat:gpt-5.5',
          providerId: 'nekoapi-chat',
          modelId: 'gpt-5.5',
        },
      ],
    });
    expect(messages[1]).toMatchObject({
      type: 'configState',
      config: {
        configuredProviders: [{ id: 'nekoapi-chat' }],
      },
    });
  });

  it('updates runtime settings through the platform config manager', async () => {
    const deps = createDeps();

    const result = await handleDesktopAgentWebviewMessage(
      {
        type: 'updateSettings',
        settings: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
      },
      deps,
    );

    expect(deps.getConfigManager().applyRuntimeAssistantSettingsFromWebview).toHaveBeenCalledWith({
      providerId: 'nekoapi-chat',
      modelId: 'gpt-5.5',
    });
    expect(result[0]).toEqual({ type: 'settingsUpdated', success: true });
    expect(result.some((message) => message.type === 'settingsData')).toBe(true);
  });

  it('rejects invalid scoped Agent runtime messages visibly', async () => {
    await expect(
      handleRawDesktopAgentRuntimeMessageRequest(
        {
          runtimeId: DESKTOP_AGENT_RUNTIME_IDS.agentWebview,
          message: { type: 'cut:timelineChanged' },
        },
        createDeps(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        runtimeId: DESKTOP_AGENT_RUNTIME_IDS.agentWebview,
        diagnostics: [
          expect.objectContaining({
            code: 'invalid-agent-webview-message',
            runtimeId: DESKTOP_AGENT_RUNTIME_IDS.agentWebview,
          }),
        ],
      }),
    );
  });

  it('rejects unknown scoped Agent runtime ids with diagnostics', async () => {
    await expect(
      handleRawDesktopAgentRuntimeMessageRequest(
        {
          runtimeId: 'cut',
          message: { type: 'getSettings' },
        },
        createDeps(),
      ),
    ).resolves.toEqual({
      runtimeId: 'cut',
      diagnostics: [
        {
          code: 'unknown-agent-runtime',
          runtimeId: 'cut',
          message: 'Desktop Agent runtime is not registered: cut',
        },
      ],
      messages: [
        {
          type: 'globalError',
          message: 'Desktop Agent runtime is not registered: cut',
        },
      ],
    });
  });

  it('classifies every Electron Agent host route', () => {
    expect(
      createAgentHostRouteCoverageDiagnostics({
        hostKind: 'electron',
        routes: DESKTOP_AGENT_HOST_ROUTE_SUPPORT,
      }),
    ).toEqual([]);
  });

  it('routes config file opens through neko.* host commands', async () => {
    const commandExecutor = createCommandExecutor();

    await expect(
      handleDesktopAgentWebviewMessage(
        { type: 'openUserConfigFile' },
        createDeps({ commandExecutor: commandExecutor.executor }),
      ),
    ).resolves.toEqual([]);
    expect(commandExecutor.handlers.openUserConfig).toHaveBeenCalledTimes(1);
  });

  it('serves the Agent message queue snapshot route for the active Desktop conversation', async () => {
    const deps = createDeps();

    await handleDesktopAgentWebviewMessage({ type: 'newConversation' }, deps);

    await expect(
      handleDesktopAgentWebviewMessage(
        { type: 'getMessageQueue', conversationId: 'desktop-conversation-1' },
        deps,
      ),
    ).resolves.toEqual([
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'desktop-conversation-1',
          items: [],
          pendingCount: 0,
          version: 1,
        },
      },
    ]);
  });

  it('accepts Desktop Agent chat messages through the Electron host runtime', async () => {
    const deps = createDeps();

    await handleDesktopAgentWebviewMessage({ type: 'newConversation' }, deps);

    const messages = await handleDesktopAgentWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'desktop-conversation-1',
        message: 'hello desktop agent',
        sessionMode: 'agent',
        chatModel: {
          providerId: 'nekoapi-chat',
          modelId: 'gpt-5.5',
          category: 'llm',
        },
      },
      deps,
    );

    expect(messages).not.toContainEqual({
      type: 'globalError',
      message: 'Desktop Agent host route is unsupported: sendMessage',
    });
    expect(messages).toEqual([
      expect.objectContaining({
        type: 'conversationList',
        conversations: [
          expect.objectContaining({
            id: 'desktop-conversation-1',
            messageCount: 2,
          }),
        ],
      }),
      {
        type: 'activeConversation',
        conversation: {
          id: 'desktop-conversation-1',
          title: 'hello desktop agent',
          messages: [
            expect.objectContaining({
              id: 'desktop-conversation-1-message-1',
              role: 'user',
              content: 'hello desktop agent',
            }),
            expect.objectContaining({
              id: 'desktop-conversation-1-message-2',
              role: 'assistant',
              isError: true,
              content: expect.stringContaining('Desktop Agent turn runtime is not connected'),
            }),
          ],
        },
      },
      expect.objectContaining({
        type: 'tabState',
        tabState: expect.objectContaining({
          activeTabId: 'desktop-conversation-1',
        }),
      }),
    ]);
  });

  it('serves empty task and context snapshots for Desktop conversations without a task runtime', async () => {
    const deps = createDeps();

    await handleDesktopAgentWebviewMessage({ type: 'newConversation' }, deps);

    await expect(
      handleDesktopAgentWebviewMessage(
        { type: 'getTasks', conversationId: 'desktop-conversation-1' },
        deps,
      ),
    ).resolves.toEqual([
      {
        type: 'tasksUpdated',
        conversationId: 'desktop-conversation-1',
        workItems: [],
      },
    ]);
    await expect(
      handleDesktopAgentWebviewMessage(
        { type: 'getContextTokenCount', conversationId: 'desktop-conversation-1' },
        deps,
      ),
    ).resolves.toEqual([
      {
        type: 'contextTokenCount',
        conversationId: 'desktop-conversation-1',
        tokenCount: 0,
      },
    ]);
  });

  it('serves empty Agent state and skill snapshots through Desktop startup routes', async () => {
    const deps = createDeps();

    await expect(
      handleDesktopAgentWebviewMessage({ type: 'getAgentStates' }, deps),
    ).resolves.toEqual([
      {
        type: 'agentStateSnapshot',
        agentStates: [],
      },
    ]);
    await expect(handleDesktopAgentWebviewMessage({ type: 'getSkills' }, deps)).resolves.toEqual([
      {
        type: 'skillsList',
        skills: [],
      },
    ]);
  });

  it('projects Desktop skill snapshot runtime data into the Agent Webview protocol', async () => {
    const deps = createDeps({
      snapshotRuntime: {
        listAgentStates: () => [
          {
            conversationId: 'desktop-conversation-1',
            phase: 'acting',
            toolName: 'Read',
            startedAt: 1777392000000,
          },
        ],
        getSkillsSnapshot: async () => ({
          skills: [
            {
              name: 'storyboard',
              description: 'Create a storyboard.',
              source: 'project',
              enabled: true,
              type: 'skill',
            },
          ],
          diagnostics: ['Desktop Agent skill scan failed for bad/SKILL.md: invalid frontmatter'],
        }),
      },
    });

    await expect(
      handleDesktopAgentWebviewMessage({ type: 'getAgentStates' }, deps),
    ).resolves.toEqual([
      {
        type: 'agentStateSnapshot',
        agentStates: [
          {
            conversationId: 'desktop-conversation-1',
            phase: 'acting',
            toolName: 'Read',
            startedAt: 1777392000000,
          },
        ],
      },
    ]);
    await expect(handleDesktopAgentWebviewMessage({ type: 'getSkills' }, deps)).resolves.toEqual([
      {
        type: 'skillsList',
        skills: [
          {
            name: 'storyboard',
            description: 'Create a storyboard.',
            source: 'project',
            enabled: true,
            type: 'skill',
          },
        ],
      },
      {
        type: 'globalError',
        message: 'Desktop Agent skill scan failed for bad/SKILL.md: invalid frontmatter',
      },
    ]);
  });

  it.each([
    [{ type: 'sendToPlugin', target: 'canvas' }, 'sendToPlugin'],
    [
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'request-1',
        conversationId: 'desktop-conversation-1',
        invocation: {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'validate',
          payload: {},
        },
      },
      'agentCapabilityLifecycleResult',
    ],
  ] satisfies readonly (readonly [WebviewToExtensionMessage, string])[])(
    'returns route-specific pending diagnostics for Desktop runtime group %s',
    async (message, type) => {
      const result = await handleDesktopAgentWebviewMessage(message, createDeps());
      expect(JSON.stringify(result)).toContain(type);
    },
  );

  it('routes project search and file opens through neko.* host commands', async () => {
    const commandExecutor = createCommandExecutor();

    await expect(
      handleDesktopAgentWebviewMessage(
        { type: 'searchProjectFiles', filter: 'scene', purpose: 'entry' },
        createDeps({ commandExecutor: commandExecutor.executor }),
      ),
    ).resolves.toEqual([
      {
        type: 'projectFiles',
        filter: 'scene',
        purpose: 'entry',
        files: [
          { path: 'scene.md', name: 'scene.md', type: 'file', icon: 'MD', source: 'workspace' },
        ],
        mentionExtras: [],
      },
    ]);
    expect(commandExecutor.handlers.searchWorkspaceFiles).toHaveBeenCalledWith(
      { filter: 'scene', limit: 30 },
      { actor: 'agent' },
    );

    await expect(
      handleDesktopAgentWebviewMessage(
        { type: 'openFile', filePath: 'scene.md' },
        createDeps({ commandExecutor: commandExecutor.executor }),
      ),
    ).resolves.toEqual([]);
    expect(commandExecutor.handlers.openWorkspaceFile).toHaveBeenCalledWith(
      { path: 'scene.md' },
      { actor: 'agent' },
    );
  });

  it('persists Desktop conversation history through the injected runtime storage', async () => {
    const storage = new MemoryConversationStorage();
    const firstRuntime = new InMemoryDesktopAgentConversationRuntime({
      storage,
      now: () => 1777392000000,
    });
    const deps = createDeps({ conversationRuntime: firstRuntime });

    await handleDesktopAgentWebviewMessage({ type: 'newConversation' }, deps);
    await handleDesktopAgentWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'desktop-conversation-1',
        message: 'make a storyboard',
        sessionMode: 'agent',
      },
      deps,
    );

    const restoredRuntime = new InMemoryDesktopAgentConversationRuntime({ storage });
    expect(restoredRuntime.listConversations()).toEqual([
      expect.objectContaining({
        id: 'desktop-conversation-1',
        title: 'make a storyboard',
        messageCount: 2,
      }),
    ]);
    expect(restoredRuntime.getActiveConversation()?.messages).toHaveLength(2);
  });

  it('keeps Desktop conversation and tab state as real scoped runtime state', async () => {
    const deps = createDeps();

    const created = await handleDesktopAgentWebviewMessage({ type: 'newConversation' }, deps);
    const list = await handleDesktopAgentWebviewMessage({ type: 'getConversations' }, deps);
    const active = await handleDesktopAgentWebviewMessage({ type: 'getActiveConversation' }, deps);
    const tabs = await handleDesktopAgentWebviewMessage({ type: 'getTabState' }, deps);

    expect(created).toEqual([
      {
        type: 'conversationList',
        conversations: [
          expect.objectContaining({
            id: 'desktop-conversation-1',
            title: 'Conversation 1',
            messageCount: 0,
          }),
        ],
      },
      {
        type: 'activeConversation',
        conversation: {
          id: 'desktop-conversation-1',
          title: 'Conversation 1',
          messages: [],
        },
      },
      {
        type: 'tabState',
        tabState: {
          openTabs: [
            {
              id: 'desktop-conversation-1',
              title: 'Conversation 1',
              conversationId: 'desktop-conversation-1',
              kind: 'chat',
            },
          ],
          activeTabId: 'desktop-conversation-1',
        },
      },
    ]);
    expect(list[0]).toMatchObject({
      type: 'conversationList',
      conversations: [expect.objectContaining({ id: 'desktop-conversation-1' })],
    });
    expect(active[0]).toMatchObject({
      type: 'activeConversation',
      conversation: { id: 'desktop-conversation-1' },
    });
    expect(tabs[0]).toMatchObject({
      type: 'tabState',
      tabState: { activeTabId: 'desktop-conversation-1' },
    });
  });

  it('allows empty Agent host responses only for host-inapplicable Webview focus routes', () => {
    const emptyAllowedRoutes = Object.entries(DESKTOP_AGENT_HOST_ROUTE_SUPPORT)
      .filter(([, support]) => support === 'host-inapplicable')
      .map(([route]) => route)
      .sort();

    expect(emptyAllowedRoutes).toEqual(['webviewKeyboardEditable', 'webviewKeyboardFocus']);
  });

  it('surfaces config load failures as protocol diagnostics', async () => {
    const configManager = createConfigManager();
    vi.mocked(configManager.reloadConfig).mockImplementation(() => {
      throw new Error('permission denied');
    });

    const messages = await handleDesktopAgentWebviewMessage(
      { type: 'refreshConfigSnapshot' },
      createDeps({ configManager }),
    );

    expect(messages).toEqual([
      {
        type: 'globalError',
        message: 'Desktop Agent config load failed: permission denied',
      },
      {
        type: 'configState',
        config: {
          providers: [],
          configuredProviders: [],
          modelGroups: [],
          configDiagnostic: {
            code: 'readError',
            filePath: '<desktop-agent-config>',
            message: 'Desktop Agent config load failed: permission denied',
          },
        },
      },
    ]);
  });
});

function createDeps(
  options: {
    readonly configManager?: DesktopAgentConfigManager;
    readonly conversationRuntime?: InMemoryDesktopAgentConversationRuntime;
    readonly commandExecutor?: NekoCommandExecutor;
    readonly snapshotRuntime?: DesktopAgentSnapshotRuntime;
  } = {},
): DesktopAgentWebviewHostDeps {
  const configManager = options.configManager ?? createConfigManager();
  const conversationRuntime =
    options.conversationRuntime ?? new InMemoryDesktopAgentConversationRuntime();
  const snapshotRuntime = options.snapshotRuntime ?? new InMemoryDesktopAgentSnapshotRuntime();
  return {
    getConfigManager: () => configManager,
    getConversationRuntime: () => conversationRuntime,
    getCommandExecutor: () => options.commandExecutor ?? createCommandExecutor().executor,
    getSnapshotRuntime: () => snapshotRuntime,
  };
}

function createCommandExecutor(): {
  readonly executor: NekoCommandExecutor;
  readonly handlers: {
    readonly searchWorkspaceFiles: ReturnType<typeof vi.fn>;
    readonly openUserConfig: ReturnType<typeof vi.fn>;
    readonly openWorkspaceConfig: ReturnType<typeof vi.fn>;
    readonly openWorkspaceFile: ReturnType<typeof vi.fn>;
    readonly revealWorkspaceFile: ReturnType<typeof vi.fn>;
    readonly revealResource: ReturnType<typeof vi.fn>;
    readonly openExternalUrl: ReturnType<typeof vi.fn>;
    readonly downloadSvg: ReturnType<typeof vi.fn>;
    readonly startDrag: ReturnType<typeof vi.fn>;
  };
} {
  const registry = createNekoCommandRegistry();
  const handlers = {
    searchWorkspaceFiles: vi.fn(async (): Promise<NekoWorkspaceSearchFilesResult> => ({
      files: [
        {
          path: 'scene.md',
          name: 'scene.md',
          type: 'file',
          icon: 'MD',
          source: 'workspace',
        },
      ],
    })),
    openUserConfig: vi.fn(async () => {}),
    openWorkspaceConfig: vi.fn(async () => {}),
    openWorkspaceFile: vi.fn(async () => {}),
    revealWorkspaceFile: vi.fn(async () => {}),
    revealResource: vi.fn(async () => {}),
    openExternalUrl: vi.fn(async () => {}),
    downloadSvg: vi.fn(async () => ({ saved: false })),
    startDrag: vi.fn(async () => {}),
  };
  registry.register(NEKO_COMMANDS.workspaceSearchFiles, handlers.searchWorkspaceFiles);
  registry.register(NEKO_COMMANDS.configOpenUser, handlers.openUserConfig);
  registry.register(NEKO_COMMANDS.configOpenWorkspace, handlers.openWorkspaceConfig);
  registry.register(NEKO_COMMANDS.workspaceOpenFile, handlers.openWorkspaceFile);
  registry.register(NEKO_COMMANDS.workspaceRevealFile, handlers.revealWorkspaceFile);
  registry.register(NEKO_COMMANDS.resourceReveal, handlers.revealResource);
  registry.register(NEKO_COMMANDS.externalOpenUrl, handlers.openExternalUrl);
  registry.register(NEKO_COMMANDS.resourceDownloadSvg, handlers.downloadSvg);
  registry.register(NEKO_COMMANDS.dragStart, handlers.startDrag);
  return { executor: registry, handlers };
}

class MemoryConversationStorage implements DesktopAgentConversationRuntimeStorage {
  private snapshot: DesktopAgentConversationRuntimeStorageSnapshot | undefined;

  load(): DesktopAgentConversationRuntimeStorageSnapshot | undefined {
    return this.snapshot;
  }

  save(snapshot: DesktopAgentConversationRuntimeStorageSnapshot): void {
    this.snapshot = snapshot;
  }
}

function createConfigManager(): DesktopAgentConfigManager {
  return {
    reloadConfig: vi.fn(),
    getAssistantSettingsData: vi.fn((): AssistantSettingsData => createAssistantSettingsData()),
    getAssistantConfigState: vi.fn((): AssistantConfigState => createAssistantConfigState()),
    applyRuntimeAssistantSettingsFromWebview: vi.fn(async () => {}),
  };
}

function createAssistantSettingsData(): AssistantSettingsData {
  return {
    selectedProviderId: 'nekoapi-chat',
    selectedModelId: 'gpt-5.5',
    customSystemPrompt: '',
    autoExecuteTools: true,
    streamResponses: true,
    showToolCalls: true,
    temperature: 0.7,
    maxTokens: 8192,
    executionMode: 'ask',
    providers: [
      {
        id: 'nekoapi-chat',
        name: 'Neko API',
        type: 'openai-compatible',
        enabled: true,
        models: [{ id: 'gpt-5.5', name: 'GPT 5.5', enabled: true }],
      },
    ],
    configuredProviders: [
      {
        id: 'nekoapi-chat',
        name: 'Neko API',
        type: 'openai-compatible',
        enabled: true,
        apiKey: 'redacted',
        models: [{ id: 'gpt-5.5', name: 'GPT 5.5', enabled: true }],
      },
    ],
    chatModelOptions: [
      {
        id: 'nekoapi-chat:gpt-5.5',
        label: 'Neko API / GPT 5.5',
        providerId: 'nekoapi-chat',
        modelId: 'gpt-5.5',
        providerLabel: 'Neko API',
        source: 'explicit-config',
      },
    ],
    modelGroups: [],
    defaultMediaModels: {},
  };
}

function createAssistantConfigState(): AssistantConfigState {
  const settings = createAssistantSettingsData();
  return {
    providers: settings.providers,
    configuredProviders: settings.configuredProviders,
    modelGroups: [],
  };
}
