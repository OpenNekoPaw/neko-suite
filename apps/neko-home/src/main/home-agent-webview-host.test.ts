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
import { HOME_AGENT_RUNTIME_IDS } from '../shared/contracts';
import type {
  HomeAgentConfigManager,
  HomeAgentConversationRuntimeStorage,
  HomeAgentConversationRuntimeStorageSnapshot,
  HomeAgentSnapshotRuntime,
  HomeAgentWebviewHostDeps,
} from './home-agent-webview-host';
import { InMemoryHomeAgentProjectionRuntime } from './home-agent-projection-runtime';
import {
  HOME_AGENT_HOST_ROUTE_SUPPORT,
  InMemoryHomeAgentConversationRuntime,
  InMemoryHomeAgentSnapshotRuntime,
  handleHomeAgentWebviewMessage,
  handleRawHomeAgentRuntimeMessageRequest,
} from './home-agent-webview-host';

describe('home Agent webview host', () => {
  it('projects platform Agent config into the package webview protocol', async () => {
    const deps = createDeps();
    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);

    const messages = await handleHomeAgentWebviewMessage(
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

    const result = await handleHomeAgentWebviewMessage(
      {
        type: 'updateSettings',
        settings: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
        conversationId: 'home-conversation-1',
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
      handleRawHomeAgentRuntimeMessageRequest(
        {
          runtimeId: HOME_AGENT_RUNTIME_IDS.agentWebview,
          message: { type: 'cut:timelineChanged' },
        },
        createDeps(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        runtimeId: HOME_AGENT_RUNTIME_IDS.agentWebview,
        diagnostics: [
          expect.objectContaining({
            code: 'invalid-agent-webview-message',
            runtimeId: HOME_AGENT_RUNTIME_IDS.agentWebview,
          }),
        ],
      }),
    );
  });

  it('rejects unknown scoped Agent runtime ids with diagnostics', async () => {
    await expect(
      handleRawHomeAgentRuntimeMessageRequest(
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
          message: 'Home Agent runtime is not registered: cut',
        },
      ],
      messages: [
        {
          type: 'globalError',
          message: 'Home Agent runtime is not registered: cut',
        },
      ],
    });
  });

  it('classifies every Electron Agent host route', () => {
    expect(
      createAgentHostRouteCoverageDiagnostics({
        hostKind: 'electron',
        routes: HOME_AGENT_HOST_ROUTE_SUPPORT,
      }),
    ).toEqual([]);
  });

  it('completes the Home projection endpoint handshake through scoped host routes', async () => {
    const deps = createDeps({
      projectionRuntime: new InMemoryHomeAgentProjectionRuntime({
        endpointEpoch: 'home-endpoint-1',
      }),
    });
    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);

    await expect(
      handleHomeAgentWebviewMessage(
        {
          type: 'projectionEndpointDiscover',
          protocolVersion: 1,
          realmId: 'home-realm-1',
        },
        deps,
      ),
    ).resolves.toEqual([
      {
        type: 'projectionEndpointReady',
        protocolVersion: 1,
        realmId: 'home-realm-1',
        endpointEpoch: 'home-endpoint-1',
      },
    ]);

    const key = {
      endpointEpoch: 'home-endpoint-1',
      attachmentId: 'attachment-1',
      tabId: 'home-conversation-1',
      conversationId: 'home-conversation-1',
    } as const;
    await expect(
      handleHomeAgentWebviewMessage({ type: 'projectionAttach', key }, deps),
    ).resolves.toEqual([
      {
        type: 'projectionSnapshot',
        key,
        sequence: 0,
        projectionVersion: 0,
        projection: {
          conversationId: 'home-conversation-1',
          projectionVersion: 0,
          turns: [],
        },
      },
    ]);
    await expect(
      handleHomeAgentWebviewMessage(
        { type: 'projectionSnapshotAck', key, sequence: 0, projectionVersion: 0 },
        deps,
      ),
    ).resolves.toEqual([]);
  });

  it('activates a Home conversation atomically and rejects stale Tab state revisions', async () => {
    const deps = createDeps();
    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);

    const tabState = {
      openTabs: [
        {
          id: 'home-conversation-1',
          title: 'Conversation 1',
          conversationId: 'home-conversation-1',
          kind: 'chat' as const,
        },
      ],
      activeTabId: 'home-conversation-1',
    };
    await expect(
      handleHomeAgentWebviewMessage(
        {
          type: 'activateConversation',
          activationId: 1,
          conversationId: 'home-conversation-1',
          tabId: 'home-conversation-1',
          expectedTabStateRevision: 1,
          tabState,
        },
        deps,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'activeConversation',
        activation: { activationId: 1, tabStateRevision: 2 },
        conversation: expect.objectContaining({ id: 'home-conversation-1' }),
      }),
      expect.objectContaining({ type: 'tabState', revision: 2 }),
    ]);

    await expect(
      handleHomeAgentWebviewMessage(
        {
          type: 'activateConversation',
          activationId: 2,
          conversationId: 'home-conversation-1',
          tabId: 'home-conversation-1',
          expectedTabStateRevision: 1,
          tabState,
        },
        deps,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        type: 'sessionDiagnostic',
        code: 'stale-tab-state-revision',
      }),
      expect.objectContaining({ type: 'tabState', revision: 2 }),
    ]);
  });

  it('routes config file opens through neko.* host commands', async () => {
    const commandExecutor = createCommandExecutor();

    await expect(
      handleHomeAgentWebviewMessage(
        { type: 'openUserConfigFile' },
        createDeps({ commandExecutor: commandExecutor.executor }),
      ),
    ).resolves.toEqual([]);
    expect(commandExecutor.handlers.openUserConfig).toHaveBeenCalledTimes(1);
  });

  it('serves the Agent message queue snapshot route for the active Home conversation', async () => {
    const deps = createDeps();

    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);

    await expect(
      handleHomeAgentWebviewMessage(
        { type: 'getMessageQueue', conversationId: 'home-conversation-1' },
        deps,
      ),
    ).resolves.toEqual([
      {
        type: 'messageQueueSnapshot',
        snapshot: {
          conversationId: 'home-conversation-1',
          items: [],
          pendingCount: 0,
          version: 1,
        },
      },
    ]);
  });

  it('accepts Home Agent chat messages through the Electron host runtime', async () => {
    const deps = createDeps();

    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);

    const messages = await handleHomeAgentWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'home-conversation-1',
        message: 'hello home agent',
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
      message: 'Home Agent host route is unsupported: sendMessage',
    });
    expect(messages).toEqual([
      expect.objectContaining({
        type: 'conversationList',
        conversations: [
          expect.objectContaining({
            id: 'home-conversation-1',
            messageCount: 2,
          }),
        ],
      }),
      {
        type: 'activeConversation',
        conversation: {
          id: 'home-conversation-1',
          title: 'hello home agent',
          messages: [
            expect.objectContaining({
              id: 'home-conversation-1-message-1',
              role: 'user',
              content: 'hello home agent',
            }),
            expect.objectContaining({
              id: 'home-conversation-1-message-2',
              role: 'assistant',
              isError: true,
              content: expect.stringContaining('Home Agent turn runtime is not connected'),
            }),
          ],
        },
      },
      expect.objectContaining({
        type: 'tabState',
        tabState: expect.objectContaining({
          activeTabId: 'home-conversation-1',
        }),
      }),
    ]);
  });

  it('serves empty task and context snapshots for Home conversations without a task runtime', async () => {
    const deps = createDeps();

    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);

    await expect(
      handleHomeAgentWebviewMessage(
        { type: 'getTasks', conversationId: 'home-conversation-1' },
        deps,
      ),
    ).resolves.toEqual([
      {
        type: 'tasksUpdated',
        conversationId: 'home-conversation-1',
        workItems: [],
      },
    ]);
    await expect(
      handleHomeAgentWebviewMessage(
        { type: 'getContextTokenCount', conversationId: 'home-conversation-1' },
        deps,
      ),
    ).resolves.toEqual([
      {
        type: 'contextTokenCount',
        conversationId: 'home-conversation-1',
        tokenCount: 0,
      },
    ]);
  });

  it('serves empty Agent state and skill snapshots through Home startup routes', async () => {
    const deps = createDeps();

    await expect(
      handleHomeAgentWebviewMessage({ type: 'getAgentStates' }, deps),
    ).resolves.toEqual([
      {
        type: 'agentStateSnapshot',
        agentStates: [],
      },
    ]);
    await expect(handleHomeAgentWebviewMessage({ type: 'getSkills' }, deps)).resolves.toEqual([
      {
        type: 'skillsList',
        skills: [],
      },
    ]);
  });

  it('projects Home skill snapshot runtime data into the Agent Webview protocol', async () => {
    const deps = createDeps({
      snapshotRuntime: {
        listAgentStates: () => [
          {
            conversationId: 'home-conversation-1',
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
          diagnostics: ['Home Agent skill scan failed for bad/SKILL.md: invalid frontmatter'],
        }),
      },
    });

    await expect(
      handleHomeAgentWebviewMessage({ type: 'getAgentStates' }, deps),
    ).resolves.toEqual([
      {
        type: 'agentStateSnapshot',
        agentStates: [
          {
            conversationId: 'home-conversation-1',
            phase: 'acting',
            toolName: 'Read',
            startedAt: 1777392000000,
          },
        ],
      },
    ]);
    await expect(handleHomeAgentWebviewMessage({ type: 'getSkills' }, deps)).resolves.toEqual([
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
        message: 'Home Agent skill scan failed for bad/SKILL.md: invalid frontmatter',
      },
    ]);
  });

  it.each([
    [{ type: 'sendToPlugin', target: 'canvas' }, 'sendToPlugin'],
    [
      {
        type: 'invokeAgentCapabilityLifecycle',
        requestId: 'request-1',
        conversationId: 'home-conversation-1',
        invocation: {
          capabilityId: 'canvas.createStoryboardFromMarkdown',
          phase: 'validate',
          payload: {},
        },
      },
      'agentCapabilityLifecycleResult',
    ],
  ] satisfies readonly (readonly [WebviewToExtensionMessage, string])[])(
    'returns route-specific pending diagnostics for Home runtime group %s',
    async (message, type) => {
      const result = await handleHomeAgentWebviewMessage(message, createDeps());
      expect(JSON.stringify(result)).toContain(type);
    },
  );

  it('routes project search and file opens through neko.* host commands', async () => {
    const commandExecutor = createCommandExecutor();

    await expect(
      handleHomeAgentWebviewMessage(
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
      handleHomeAgentWebviewMessage(
        { type: 'openFile', filePath: 'scene.md' },
        createDeps({ commandExecutor: commandExecutor.executor }),
      ),
    ).resolves.toEqual([]);
    expect(commandExecutor.handlers.openWorkspaceFile).toHaveBeenCalledWith(
      { path: 'scene.md' },
      { actor: 'agent' },
    );
  });

  it('persists Home conversation history through the injected runtime storage', async () => {
    const storage = new MemoryConversationStorage();
    const firstRuntime = new InMemoryHomeAgentConversationRuntime({
      storage,
      now: () => 1777392000000,
    });
    const deps = createDeps({ conversationRuntime: firstRuntime });

    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);
    await handleHomeAgentWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'home-conversation-1',
        message: 'make a storyboard',
        sessionMode: 'agent',
      },
      deps,
    );

    const restoredRuntime = new InMemoryHomeAgentConversationRuntime({ storage });
    expect(restoredRuntime.listConversations()).toEqual([
      expect.objectContaining({
        id: 'home-conversation-1',
        title: 'make a storyboard',
        messageCount: 2,
      }),
    ]);
    expect(restoredRuntime.getActiveConversation()?.messages).toHaveLength(2);
  });

  it('keeps Home conversation and tab state as real scoped runtime state', async () => {
    const deps = createDeps();

    const created = await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);
    const list = await handleHomeAgentWebviewMessage({ type: 'getConversations' }, deps);
    const active = await handleHomeAgentWebviewMessage({ type: 'getActiveConversation' }, deps);
    const tabs = await handleHomeAgentWebviewMessage({ type: 'getTabState' }, deps);

    expect(created).toEqual([
      {
        type: 'conversationList',
        conversations: [
          expect.objectContaining({
            id: 'home-conversation-1',
            title: 'Conversation 1',
            messageCount: 0,
          }),
        ],
      },
      {
        type: 'activeConversation',
        conversation: {
          id: 'home-conversation-1',
          title: 'Conversation 1',
          messages: [],
        },
      },
      {
        type: 'tabState',
        revision: 1,
        tabState: {
          openTabs: [
            {
              id: 'home-conversation-1',
              title: 'Conversation 1',
              conversationId: 'home-conversation-1',
              kind: 'chat',
            },
          ],
          activeTabId: 'home-conversation-1',
        },
      },
    ]);
    expect(list[0]).toMatchObject({
      type: 'conversationList',
      conversations: [expect.objectContaining({ id: 'home-conversation-1' })],
    });
    expect(active[0]).toMatchObject({
      type: 'activeConversation',
      conversation: { id: 'home-conversation-1' },
    });
    expect(tabs[0]).toMatchObject({
      type: 'tabState',
      tabState: { activeTabId: 'home-conversation-1' },
    });
  });

  it('returns a cache-only snapshot for a non-active Home conversation', async () => {
    const deps = createDeps();
    const runtime = deps.getConversationRuntime();

    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);
    await handleHomeAgentWebviewMessage(
      {
        type: 'sendMessage',
        conversationId: 'home-conversation-1',
        message: 'background history',
        sessionMode: 'agent',
      },
      deps,
    );
    await handleHomeAgentWebviewMessage({ type: 'newConversation' }, deps);

    const messages = await handleHomeAgentWebviewMessage(
      { type: 'getConversationSnapshot', conversationId: 'home-conversation-1' },
      deps,
    );

    expect(messages).toEqual([
      {
        type: 'conversationSnapshot',
        conversation: expect.objectContaining({
          id: 'home-conversation-1',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'background history' }),
          ]),
        }),
      },
    ]);
    expect(runtime.getActiveConversation()?.id).toBe('home-conversation-2');
  });

  it('allows empty Agent host responses only for host-inapplicable Webview focus routes', () => {
    const emptyAllowedRoutes = Object.entries(HOME_AGENT_HOST_ROUTE_SUPPORT)
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

    const messages = await handleHomeAgentWebviewMessage(
      { type: 'refreshConfigSnapshot' },
      createDeps({ configManager }),
    );

    expect(messages).toEqual([
      {
        type: 'globalError',
        message: 'Home Agent config load failed: permission denied',
      },
      {
        type: 'configState',
        config: {
          providers: [],
          configuredProviders: [],
          modelGroups: [],
          configDiagnostic: {
            code: 'readError',
            filePath: '<home-agent-config>',
            message: 'Home Agent config load failed: permission denied',
          },
        },
      },
    ]);
  });
});

function createDeps(
  options: {
    readonly configManager?: HomeAgentConfigManager;
    readonly conversationRuntime?: InMemoryHomeAgentConversationRuntime;
    readonly commandExecutor?: NekoCommandExecutor;
    readonly projectionRuntime?: InMemoryHomeAgentProjectionRuntime;
    readonly snapshotRuntime?: HomeAgentSnapshotRuntime;
  } = {},
): HomeAgentWebviewHostDeps {
  const configManager = options.configManager ?? createConfigManager();
  const conversationRuntime =
    options.conversationRuntime ?? new InMemoryHomeAgentConversationRuntime();
  const projectionRuntime =
    options.projectionRuntime ??
    new InMemoryHomeAgentProjectionRuntime({ endpointEpoch: 'home-test-endpoint' });
  const snapshotRuntime = options.snapshotRuntime ?? new InMemoryHomeAgentSnapshotRuntime();
  return {
    getConfigManager: () => configManager,
    getConversationRuntime: () => conversationRuntime,
    getCommandExecutor: () => options.commandExecutor ?? createCommandExecutor().executor,
    getProjectionRuntime: () => projectionRuntime,
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

class MemoryConversationStorage implements HomeAgentConversationRuntimeStorage {
  private snapshot: HomeAgentConversationRuntimeStorageSnapshot | undefined;

  load(): HomeAgentConversationRuntimeStorageSnapshot | undefined {
    return this.snapshot;
  }

  save(snapshot: HomeAgentConversationRuntimeStorageSnapshot): void {
    this.snapshot = snapshot;
  }
}

function createConfigManager(): HomeAgentConfigManager {
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
  return createAssistantSettingsData();
}
