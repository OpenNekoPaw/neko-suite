import { describe, expect, it, vi } from 'vitest';
import { buildAgentTurnRuntimeInput } from '../agent-turn-assembly';
import {
  AGENT_TURN_PRECONDITION_MESSAGE,
  executeAgentTurn,
  getAgentTurnPreconditionMessage,
  runAgentTurnRuntime,
  type AgentTurnRunner,
  type ExecuteAgentTurnInput,
} from '../agent-turn-runtime';
import type { AgentPendingMessageItem } from '../agent-runner-port';
import { createTimelineSelectionContextPacket } from '../multimodal-context-packet';
import type { AgentEvent } from '../../session/types';

type TestPlatform = { readonly name: string };
type TestContext = {
  workspaceRoot?: string;
  metadata?: Record<string, unknown>;
  imageAttachments?: readonly unknown[];
};
type TestHistoryMessage = { readonly role: string; readonly content: string };
type TestProvider = {
  readonly id: string;
  readonly isConfigured: boolean;
  readonly modelIds?: readonly string[];
  readonly source?: 'explicit-config' | 'account-gateway';
  readonly accountCatalogAvailable?: boolean;
  readonly entitledModelIds?: readonly string[];
  readonly modelCapabilities?: Readonly<Record<string, readonly string[]>>;
};

function createAgentRunner(
  overrides: {
    readonly history?: readonly unknown[];
    readonly events?: AsyncIterable<AgentEvent>;
    readonly activeSkillName?: string;
    readonly isRunning?: boolean;
    readonly config?: unknown;
  } = {},
): AgentTurnRunner<TestPlatform, TestContext> {
  let activeSkillName = overrides.activeSkillName;
  const pendingMessages: AgentPendingMessageItem[] = [];
  let pendingSequence = 0;
  return {
    getHistory: vi.fn(() => overrides.history ?? []),
    getConfig: vi.fn(() => overrides.config),
    configure: vi.fn(async () => undefined),
    execute: vi.fn(() => overrides.events ?? emptyEvents()),
    isRunning: vi.fn(() => overrides.isRunning ?? false),
    enqueuePendingMessage: vi.fn((input) => {
      if (!(overrides.isRunning ?? false)) return null;
      pendingSequence += 1;
      const item: AgentPendingMessageItem = {
        id: `queue-${pendingSequence}`,
        conversationId: input.conversationId,
        content: input.content,
        createdAt: input.now ?? 1000 + pendingSequence,
        source: 'composer',
      };
      pendingMessages.push(item);
      return item;
    }),
    getPendingMessageQueue: vi.fn(() => pendingMessages.map((item) => ({ ...item }))),
    removePendingMessage: vi.fn((queueItemId) => {
      const index = pendingMessages.findIndex((item) => item.id === queueItemId);
      if (index < 0) throw new Error('missing queue item');
      const item = pendingMessages[index];
      if (!item) throw new Error('missing queue item');
      pendingMessages.splice(index, 1);
      return { ...item };
    }),
    updatePendingMessage: vi.fn((queueItemId, content, now) => {
      const index = pendingMessages.findIndex((item) => item.id === queueItemId);
      if (index < 0) throw new Error('missing queue item');
      const item = pendingMessages[index];
      if (!item) throw new Error('missing queue item');
      const updated = { ...item, content, updatedAt: now ?? 1000 };
      pendingMessages[index] = updated;
      return { ...updated };
    }),
    promotePendingMessage: vi.fn((queueItemId) => {
      const index = pendingMessages.findIndex((item) => item.id === queueItemId);
      if (index < 0) throw new Error('missing queue item');
      const item = pendingMessages[index];
      if (!item) throw new Error('missing queue item');
      pendingMessages.splice(index, 1);
      pendingMessages.unshift(item);
      return { ...item };
    }),
    getPendingMessagesCount: vi.fn(() => pendingMessages.length),
    dequeuePendingMessage: vi.fn(() => {
      const item = pendingMessages.shift();
      return item ? { ...item } : null;
    }),
    drainPendingMessageQueue: vi.fn(() => pendingMessages.splice(0).map((item) => ({ ...item }))),
    applySkillInjection: vi.fn((_injection, skill) => {
      activeSkillName = skill?.name;
    }),
    getActiveSkill: vi.fn(() =>
      activeSkillName
        ? {
            name: activeSkillName,
            description: `${activeSkillName} description`,
            content: '',
            source: 'builtin',
            enabled: true,
          }
        : undefined,
    ),
    clearActiveSkill: vi.fn(() => {
      activeSkillName = undefined;
    }),
    onDidRequestConfirmation: vi.fn(() => ({ dispose: vi.fn() })),
  };
}

function createBaseInput(
  overrides: Partial<
    ExecuteAgentTurnInput<TestPlatform, TestContext, TestHistoryMessage, TestProvider>
  > = {},
) {
  const agentRunner = createAgentRunner();
  const fullHistory: TestHistoryMessage[] = [
    { role: 'user', content: 'previous request' },
    { role: 'assistant', content: 'previous answer' },
    { role: 'user', content: 'current request' },
  ];
  let queueSnapshotVersion = 6;

  const input = {
    conversationId: 'conv-1',
    message: 'current request',
    platform: { name: 'platform' },
    settings: {
      executionMode: 'ask' as const,
      autoExecuteTools: true,
      temperature: 0.7,
    },
    chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' as const },
    providerSource: {
      getProvider: vi.fn(() => ({ id: 'openai', isConfigured: true, modelIds: ['gpt-4.1'] })),
    },
    agentManager: {
      getOrCreate: vi.fn(() => agentRunner),
      loadHistoryWithContext: vi.fn(),
      nextMessageQueueSnapshotVersion: vi.fn(() => {
        queueSnapshotVersion += 1;
        return queueSnapshotVersion;
      }),
    },
    conversations: {
      getConversationMessageCount: vi.fn(() => fullHistory.length),
      getFullHistory: vi.fn(() => fullHistory),
      addAssistantMessage: vi.fn(),
    },
    getBaseSystemPrompt: vi.fn(() => 'base system prompt'),
    isPlanMode: vi.fn(() => false),
    getWorkspaceRoot: vi.fn(() => '/repo'),
    getWorkspaceIgnoreRules: vi.fn(() => ({ gitignoreRules: ['ignored/'] })),
    getAmbientCanvas: vi.fn(() => []),
    createContext: vi.fn(({ workspaceRoot }) => ({ workspaceRoot })),
    processStream: vi.fn(async () => ({
      accumulatedResponse: 'done',
      accumulatedThinking: '',
      hasError: false,
      collectedToolCalls: [],
      contentBlocks: [],
    })),
    generateMessageId: vi.fn(() => 'assistant-1'),
    now: vi.fn(() => 123),
    ...overrides,
  };

  return { input, agentRunner };
}

describe('executeAgentTurn', () => {
  it('provides a shared default precondition message for host adapters', () => {
    expect(getAgentTurnPreconditionMessage('no-provider-configured')).toBe(
      AGENT_TURN_PRECONDITION_MESSAGE,
    );
    expect(getAgentTurnPreconditionMessage('missing-platform')).toBe(
      AGENT_TURN_PRECONDITION_MESSAGE,
    );
    expect(getAgentTurnPreconditionMessage('no-provider-configured')).toBe(
      AGENT_TURN_PRECONDITION_MESSAGE,
    );
    expect(getAgentTurnPreconditionMessage('missing-chat-model')).toContain(
      'No chat model is selected',
    );
  });

  it('returns unmet precondition when selected provider is not configured', async () => {
    const { input } = createBaseInput({
      chatModel: { providerId: 'missing', modelId: 'gpt-4.1', category: 'llm' },
      providerSource: {
        getProvider: vi.fn(() => undefined),
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'precondition-unmet',
      reason: 'chat-provider-not-configured',
    });
    expect(input.agentManager.getOrCreate).not.toHaveBeenCalled();
  });

  it('returns unmet precondition when no model is selected', async () => {
    const { input } = createBaseInput({
      chatModel: { providerId: 'openai', modelId: '', category: 'llm' },
      providerSource: {
        getProvider: vi.fn(() => ({ id: 'openai', isConfigured: true, modelIds: ['gpt-4.1'] })),
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'precondition-unmet',
      reason: 'missing-chat-model',
    });
    expect(input.agentManager.getOrCreate).not.toHaveBeenCalled();
  });

  it('returns unmet precondition when selected model does not belong to provider', async () => {
    const { input } = createBaseInput({
      chatModel: { providerId: 'openai', modelId: 'claude-3', category: 'llm' },
      providerSource: {
        getProvider: vi.fn(() => ({ id: 'openai', isConfigured: true, modelIds: ['gpt-4.1'] })),
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'precondition-unmet',
      reason: 'chat-model-not-found',
    });
    expect(input.agentManager.getOrCreate).not.toHaveBeenCalled();
  });

  it('returns unmet precondition before runner configuration when selected model lacks vision', async () => {
    const { input } = createBaseInput({
      chatModel: { providerId: 'neko-account-gateway', modelId: 'text-only', category: 'llm' },
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'abc' }],
      providerSource: {
        getProvider: vi.fn(() => ({
          id: 'neko-account-gateway',
          isConfigured: true,
          source: 'account-gateway',
          accountCatalogAvailable: true,
          modelIds: ['text-only'],
          entitledModelIds: ['text-only'],
          modelCapabilities: { 'text-only': ['chat'] },
        })),
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'precondition-unmet',
      reason: 'missing-required-capability',
    });
    expect(input.agentManager.getOrCreate).not.toHaveBeenCalled();
  });

  it('returns unmet precondition before runner configuration for unauthorized account models', async () => {
    const { input } = createBaseInput({
      chatModel: {
        providerId: 'neko-account-gateway',
        modelId: 'official-denied',
        category: 'llm',
      },
      providerSource: {
        getProvider: vi.fn(() => ({
          id: 'neko-account-gateway',
          isConfigured: true,
          source: 'account-gateway',
          accountCatalogAvailable: true,
          modelIds: ['official-denied'],
          entitledModelIds: ['official-chat'],
          modelCapabilities: { 'official-denied': ['chat'] },
        })),
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'precondition-unmet',
      reason: 'account-model-not-entitled',
    });
    expect(input.agentManager.getOrCreate).not.toHaveBeenCalled();
  });

  it('refuses to configure the runner when the request omits chatModel routing', async () => {
    const { input } = createBaseInput({
      chatModel: undefined,
      providerSource: {
        getProvider: vi.fn(() => ({ id: 'openai', isConfigured: true, modelIds: ['gpt-4.1'] })),
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'precondition-unmet',
      reason: 'missing-chat-provider',
    });
    expect(input.agentManager.getOrCreate).not.toHaveBeenCalled();
  });

  it('hydrates previous conversation history for a fresh agent runner', async () => {
    const { input } = createBaseInput();

    await executeAgentTurn(input);

    expect(input.agentManager.loadHistoryWithContext).toHaveBeenCalledWith('conv-1', [
      { role: 'user', content: 'previous request' },
      { role: 'assistant', content: 'previous answer' },
    ]);
  });

  it('hydrates history after runner configuration creates the session', async () => {
    const calls: string[] = [];
    const agentRunner = createAgentRunner({
      history: [{ role: 'system', content: 'base system prompt' }],
    });
    vi.mocked(agentRunner.configure).mockImplementation(async () => {
      calls.push('configure');
    });
    const { input } = createBaseInput({
      agentManager: {
        getOrCreate: vi.fn(() => agentRunner),
        loadHistoryWithContext: vi.fn(() => {
          calls.push('load-history');
        }),
      },
    });

    await executeAgentTurn(input);

    expect(calls).toEqual(['configure', 'load-history']);
    expect(input.agentManager.loadHistoryWithContext).toHaveBeenCalledWith('conv-1', [
      { role: 'user', content: 'previous request' },
      { role: 'assistant', content: 'previous answer' },
    ]);
  });

  it('configures the runner with turn model, execution metadata, and conversation scope', async () => {
    const { input, agentRunner } = createBaseInput({
      chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      mediaModels: {
        image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      },
      executionOverrides: { metadata: { traceId: 'trace-1' } },
      isPlanMode: vi.fn(() => true),
    });

    await executeAgentTurn(input);

    expect(agentRunner.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: { name: 'platform' },
        conversationId: 'conv-1',
        executionMode: 'plan',
        modelId: 'gpt-4.1',
        workspaceRoot: '/repo',
        workspaceIgnoreRules: { gitignoreRules: ['ignored/'] },
        providerExpressionTargets: [
          { capability: 'image.generate', providerId: 'flux', modelId: 'flux-pro' },
        ],
      }),
    );
    expect(agentRunner.execute).toHaveBeenCalledWith(
      'current request',
      expect.objectContaining({
        metadata: expect.objectContaining({
          traceId: 'trace-1',
          mediaModels: {
            image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
          },
        }),
      }),
    );
  });

  it('keeps Plan Mode above lifecycle Skill tool policy', async () => {
    const { input, agentRunner } = createBaseInput({
      isPlanMode: vi.fn(() => true),
      skillLifecycle: {
        projection: {
          promptSections: [
            {
              id: 'skill:domainSkill:review:record-1',
              layer: 'skill',
              content: 'Review prompt',
              priority: 20,
              recordId: 'record-1',
              slot: 'domainSkill',
              skillName: 'review',
            },
          ],
          toolPolicy: {
            mode: 'allowlist',
            allowedTools: ['WriteDocument'],
            contributingRecordIds: ['record-1'],
            diagnostics: [],
          },
          diagnostics: [],
          visibleIndicators: [],
        },
      },
    });

    await executeAgentTurn(input);

    expect(agentRunner.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'plan',
        autoExecuteTools: true,
      }),
    );
    expect(agentRunner.applySkillInjection).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: ['WriteDocument'],
      }),
      expect.any(Object),
    );
  });

  it('keeps approval gating above lifecycle Skill allowlists', async () => {
    const { input, agentRunner } = createBaseInput({
      settings: {
        executionMode: 'ask',
        autoExecuteTools: false,
      },
      skillLifecycle: {
        projection: {
          promptSections: [
            {
              id: 'skill:domainSkill:review:record-1',
              layer: 'skill',
              content: 'Review prompt',
              priority: 20,
              recordId: 'record-1',
              slot: 'domainSkill',
              skillName: 'review',
            },
          ],
          toolPolicy: {
            mode: 'allowlist',
            allowedTools: ['WriteDocument'],
            contributingRecordIds: ['record-1'],
            diagnostics: [],
          },
          diagnostics: [],
          visibleIndicators: [],
        },
      },
    });

    await executeAgentTurn(input);

    expect(agentRunner.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        executionMode: 'ask',
        autoExecuteTools: false,
      }),
    );
    expect(agentRunner.applySkillInjection).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedTools: ['WriteDocument'],
      }),
      expect.any(Object),
    );
  });

  it('queues same-config text input while the runner is already processing', async () => {
    const platform = { name: 'platform' };
    const agentRunner = createAgentRunner({
      isRunning: true,
      config: {
        platform,
        systemPrompt: 'base system prompt',
        maxIterations: 200,
        autoExecuteTools: true,
        temperature: 0.7,
        providerId: 'openai',
        modelId: 'gpt-4.1',
        executionMode: 'ask',
        workspaceRoot: '/repo',
        workspaceIgnoreRules: { gitignoreRules: ['ignored/'] },
        conversationId: 'conv-1',
      },
    });
    const onMessageQueued = vi.fn();
    const { input } = createBaseInput({
      platform,
      agentManager: {
        getOrCreate: vi.fn(() => agentRunner),
        loadHistoryWithContext: vi.fn(),
        nextMessageQueueSnapshotVersion: vi.fn(() => 7),
      },
      onMessageQueued,
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'queued',
      pendingCount: 1,
    });

    expect(agentRunner.enqueuePendingMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        content: 'current request',
      }),
    );
    expect(agentRunner.configure).not.toHaveBeenCalled();
    expect(agentRunner.execute).not.toHaveBeenCalled();
    expect(onMessageQueued).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      content: 'Message queued (1 pending)',
      pendingCount: 1,
      item: expect.objectContaining({
        id: 'queue-1',
        conversationId: 'conv-1',
        content: 'current request',
      }),
      snapshot: expect.objectContaining({
        conversationId: 'conv-1',
        pendingCount: 1,
        version: 7,
        items: [expect.objectContaining({ id: 'queue-1', content: 'current request' })],
      }),
    });
  });

  it('lets normalized per-turn LLM options override global settings for runner configuration', async () => {
    const { input, agentRunner } = createBaseInput({
      chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      settings: {
        executionMode: 'ask',
        autoExecuteTools: true,
        temperature: 0.2,
        topP: 0.5,
        maxTokens: 1024,
        thinkingBudget: 2048,
      },
      llmRuntimeOptions: {
        temperature: 0.9,
        topP: 0.95,
        maxTokens: 4096,
        thinkingBudget: 8192,
        providerOptions: {
          openai: {
            reasoningEffort: 'high',
            textVerbosity: 'medium',
          },
        },
      },
    });

    await executeAgentTurn(input);

    expect(agentRunner.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.9,
        topP: 0.95,
        maxTokens: 4096,
        thinkingBudget: 8192,
        providerOptions: {
          openai: {
            reasoningEffort: 'high',
            textVerbosity: 'medium',
          },
        },
      }),
    );
  });

  it('keeps omitted projected LLM options from falling back to global settings', async () => {
    const { input, agentRunner } = createBaseInput({
      chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      settings: {
        executionMode: 'ask',
        autoExecuteTools: true,
        temperature: 0.2,
        topP: 0.5,
        maxTokens: 1024,
        thinkingBudget: 2048,
      },
      llmRuntimeOptions: {
        projected: true,
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
          },
        },
      },
    });

    await executeAgentTurn(input);

    expect(agentRunner.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: undefined,
        topP: undefined,
        maxTokens: undefined,
        thinkingBudget: undefined,
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
          },
        },
      }),
    );
  });

  it('replays active skill injection after runner configuration', async () => {
    const activeSkill = {
      skill: {
        name: 'review',
        description: 'Review code',
        content: 'Review instructions',
        source: 'project' as const,
        enabled: true,
      },
      injection: {
        name: 'review',
        systemPrompt: 'Review instructions',
        type: 'skill' as const,
        allowedTools: ['read'],
      },
    };
    const { input, agentRunner } = createBaseInput({ activeSkill });

    await executeAgentTurn(input);

    const applySkillInjection = agentRunner.applySkillInjection;
    expect(applySkillInjection).toBeDefined();
    expect(applySkillInjection).toHaveBeenCalledWith(activeSkill.injection, activeSkill.skill);
    expect(vi.mocked(applySkillInjection!).mock.invocationCallOrder[0] ?? 0).toBeGreaterThan(
      vi.mocked(agentRunner.configure).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('replays lifecycle projection before retired active skill state can apply', async () => {
    const retiredSkill = {
      skill: {
        name: 'retired',
        description: 'Retired skill',
        content: 'Retired prompt',
        source: 'project' as const,
        enabled: true,
      },
      injection: {
        name: 'retired',
        systemPrompt: 'Retired prompt',
        type: 'skill' as const,
        allowedTools: ['retired_tool'],
      },
    };
    const { input, agentRunner } = createBaseInput({
      activeSkill: retiredSkill,
      skillLifecycle: {
        projection: {
          promptSections: [
            {
              id: 'skill:stagePersona:persona:record-1',
              layer: 'skill',
              content: 'Stage persona prompt',
              priority: 10,
              recordId: 'record-1',
              slot: 'stagePersona',
              skillName: 'persona',
            },
            {
              id: 'skill:domainSkill:review:record-2',
              layer: 'skill',
              content: 'Review prompt',
              priority: 20,
              recordId: 'record-2',
              slot: 'domainSkill',
              skillName: 'review',
            },
          ],
          toolPolicy: {
            mode: 'intersection',
            allowedTools: ['ReadDocument'],
            contributingRecordIds: ['record-1', 'record-2'],
            diagnostics: [],
          },
          diagnostics: [],
          visibleIndicators: [],
        },
      },
    });

    await executeAgentTurn(input);

    expect(agentRunner.applySkillInjection).toHaveBeenCalledWith(
      {
        name: 'lifecycle-projection',
        type: 'skill',
        systemPrompt: 'Stage persona prompt\n\nReview prompt',
        allowedTools: ['ReadDocument'],
      },
      expect.objectContaining({
        name: 'lifecycle-projection',
        content: 'Stage persona prompt\n\nReview prompt',
      }),
    );
  });

  it('does not apply retired active skill state when lifecycle projection is empty', async () => {
    const retiredSkill = {
      skill: {
        name: 'retired',
        description: 'Retired skill',
        content: 'Retired prompt',
        source: 'project' as const,
        enabled: true,
      },
      injection: {
        name: 'retired',
        systemPrompt: 'Retired prompt',
        type: 'skill' as const,
        allowedTools: ['retired_tool'],
      },
    };
    const { input, agentRunner } = createBaseInput({
      activeSkill: retiredSkill,
      skillLifecycle: {
        projection: {
          promptSections: [],
          toolPolicy: {
            mode: 'unrestricted',
            contributingRecordIds: [],
            diagnostics: [],
          },
          diagnostics: [],
          visibleIndicators: [],
        },
      },
    });

    await executeAgentTurn(input);

    expect(agentRunner.applySkillInjection).not.toHaveBeenCalled();
  });

  it('fails visibly on blocking lifecycle projection diagnostics before retired state can mask it', async () => {
    const retiredSkill = {
      skill: {
        name: 'retired',
        description: 'Retired skill',
        content: 'Retired prompt',
        source: 'project' as const,
        enabled: true,
      },
      injection: {
        name: 'retired',
        systemPrompt: 'Retired prompt',
        type: 'skill' as const,
      },
    };
    const { input } = createBaseInput({
      activeSkill: retiredSkill,
      skillLifecycle: {
        projection: {
          promptSections: [],
          toolPolicy: {
            mode: 'conflict',
            contributingRecordIds: ['record-1', 'record-2'],
            diagnostics: [
              {
                code: 'tool-policy-conflict',
                message: 'Active Skill lifecycle records have incompatible tool policies',
                conversationId: 'conv-1',
              },
            ],
          },
          diagnostics: [
            {
              code: 'tool-policy-conflict',
              message: 'Active Skill lifecycle records have incompatible tool policies',
              conversationId: 'conv-1',
            },
          ],
          visibleIndicators: [],
        },
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'completed',
      assistantMessage: expect.objectContaining({
        isError: true,
        content:
          'Skill lifecycle projection failed: Active Skill lifecycle records have incompatible tool policies',
      }),
    });
    expect(input.agentManager.getOrCreate).not.toHaveBeenCalled();
    expect(input.conversations.addAssistantMessage).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ isError: true }),
    );
  });

  it('clears stale turn-managed skill injection when the current conversation has no active skill', async () => {
    const activeSkill = {
      skill: {
        name: 'character-workflow',
        description: 'Character workflow',
        content: 'Character instructions',
        source: 'builtin' as const,
        enabled: true,
      },
      injection: {
        name: 'character-workflow',
        systemPrompt: 'Character instructions',
        type: 'skill' as const,
        allowedTools: ['read'],
      },
    };
    const { input, agentRunner } = createBaseInput({ activeSkill });

    await executeAgentTurn(input);
    await executeAgentTurn({ ...input, activeSkill: null });

    expect(agentRunner.clearActiveSkill).toHaveBeenCalledOnce();
    expect(agentRunner.applySkillInjection).toHaveBeenCalledOnce();
    expect(
      vi.mocked(agentRunner.clearActiveSkill!).mock.invocationCallOrder[0] ?? 0,
    ).toBeGreaterThan(vi.mocked(agentRunner.configure).mock.invocationCallOrder[1] ?? 0);
    expect(vi.mocked(agentRunner.execute).mock.invocationCallOrder[1] ?? 0).toBeGreaterThan(
      vi.mocked(agentRunner.clearActiveSkill!).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('does not clear a runner skill that was replaced outside the turn-managed skill state', async () => {
    const activeSkill = {
      skill: {
        name: 'character-workflow',
        description: 'Character workflow',
        content: 'Character instructions',
        source: 'builtin' as const,
        enabled: true,
      },
      injection: {
        name: 'character-workflow',
        systemPrompt: 'Character instructions',
        type: 'skill' as const,
        allowedTools: ['read'],
      },
    };
    const { input, agentRunner } = createBaseInput({ activeSkill });

    await executeAgentTurn(input);
    vi.mocked(agentRunner.getActiveSkill!).mockReturnValue({
      name: 'creation-persona',
      description: 'IDC persona',
      content: '',
      source: 'builtin',
      enabled: true,
    });
    await executeAgentTurn({ ...input, activeSkill: null });

    expect(agentRunner.clearActiveSkill).not.toHaveBeenCalled();
  });

  it('persists assistant message generated from the stream snapshot', async () => {
    const { input } = createBaseInput();

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'completed',
      assistantMessage: {
        id: 'assistant-1',
        role: 'assistant',
        content: 'done',
        timestamp: 123,
      },
    });
    expect(input.conversations.addAssistantMessage).toHaveBeenCalledWith('conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: 'done',
      timestamp: 123,
    });
  });

  it('persists a visible error when the provider returns an empty stream', async () => {
    const { input } = createBaseInput({
      processStream: vi.fn(async () => ({
        accumulatedResponse: '',
        accumulatedThinking: '',
        hasError: false,
        collectedToolCalls: [],
        contentBlocks: [],
      })),
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'completed',
      assistantMessage: {
        id: 'assistant-1',
        role: 'assistant',
        content:
          'The selected chat model (openai/gpt-4.1) completed without returning text, tool calls, thinking, or an error. Please retry or choose another model.',
        timestamp: 123,
        isError: true,
      },
    });
    expect(input.conversations.addAssistantMessage).toHaveBeenCalledWith('conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content:
        'The selected chat model (openai/gpt-4.1) completed without returning text, tool calls, thinking, or an error. Please retry or choose another model.',
      timestamp: 123,
      isError: true,
    });
  });

  it('uses the same assistant id for stream projection and final persistence', async () => {
    const processStream = vi.fn(async () => ({
      accumulatedResponse: 'done',
      accumulatedThinking: '',
      hasError: false,
      collectedToolCalls: [],
      contentBlocks: [],
    }));
    const { input } = createBaseInput({ processStream });

    await executeAgentTurn(input);

    expect(processStream).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        messageId: 'assistant-1',
      }),
    );
    expect(input.conversations.addAssistantMessage).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ id: 'assistant-1' }),
    );
  });

  it('routes phase changes and tool confirmations through host callbacks', async () => {
    const onPhaseChange = vi.fn();
    const onToolConfirmation = vi.fn();
    const { input, agentRunner } = createBaseInput({
      onPhaseChange,
      onToolConfirmation,
      processStream: vi.fn(async ({ onPhaseChange: emitPhase }) => {
        emitPhase('tool', 'read_file');
        return {
          accumulatedResponse: '',
          accumulatedThinking: '',
          hasError: false,
          collectedToolCalls: [],
          contentBlocks: [],
        };
      }),
    });

    await executeAgentTurn(input);

    const confirmationListener = vi.mocked(agentRunner.onDidRequestConfirmation).mock.calls[0]?.[0];
    confirmationListener?.({
      toolCallId: 'tool-1',
      toolName: 'read_file',
      action: 'read',
      description: 'Read file',
      details: { path: 'src/app.ts' },
    });

    expect(onPhaseChange).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      phase: 'tool',
      toolName: 'read_file',
      timestamp: 123,
    });
    expect(onToolConfirmation).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      toolCallId: 'tool-1',
      toolName: 'read_file',
      action: 'read',
      description: 'Read file',
      details: { path: 'src/app.ts' },
    });
  });

  it('patches image, timeline, canvas, execution metadata, and subagent runtime inputs', async () => {
    const ensureSubAgentEventSubscription = vi.fn();
    const timelineContextPacket = createTimelineSelectionContextPacket(
      [{ elementId: 'clip-1', trackId: 'v1', mediaType: 'video', sourceUri: 'file://clip.mp4' }],
      { createdAt: 100, playheadMs: 1200 },
    );
    const buildTimelineContextPacket = vi.fn(async () => timelineContextPacket);
    const imageAttachments = [{ type: 'base64' as const, media_type: 'image/png', data: 'abc' }];
    const { input, agentRunner } = createBaseInput({
      imageAttachments,
      providerSource: {
        getProvider: vi.fn(() => ({
          id: 'openai',
          isConfigured: true,
          modelIds: ['gpt-4.1'],
          modelCapabilities: { 'gpt-4.1': ['chat', 'vision'] },
        })),
      },
      mediaModels: {
        video: { providerId: 'runway', modelId: 'gen-3', category: 'video' },
      },
      executionOverrides: { metadata: { traceId: 'trace-2' } },
      getAmbientCanvas: vi.fn(() => [{ nodeId: 'node-1', type: 'shot', summary: 'Shot one' }]),
      buildTimelineContextPacket,
      ensureSubAgentEventSubscription,
    });

    await executeAgentTurn(input);

    expect(agentRunner.execute).toHaveBeenCalledWith(
      'current request',
      expect.objectContaining({
        imageAttachments,
        multimodalContextPacket: expect.objectContaining({
          metadata: expect.objectContaining({ conversationId: 'conv-1' }),
          selection: expect.arrayContaining([
            expect.objectContaining({ id: 'sel-text-user-message', kind: 'unknown' }),
            expect.objectContaining({ id: 'sel-attachment-image-1', kind: 'asset' }),
            expect.objectContaining({ id: 'sel-timeline-clip-1', kind: 'timeline-clip' }),
            expect.objectContaining({
              id: 'sel-canvas-node-1',
              kind: 'canvas-node',
              panel: 'canvas',
            }),
          ]),
          artifactRefs: expect.arrayContaining([
            expect.objectContaining({ id: 'artifact-attachment-image-1', kind: 'image' }),
            expect.objectContaining({ id: 'artifact-clip-1', kind: 'video' }),
          ]),
          perceptionInputs: expect.arrayContaining([
            expect.objectContaining({ id: 'input-text-user-message', modality: 'text' }),
            expect.objectContaining({ id: 'input-attachment-image-1', modality: 'image' }),
            expect.objectContaining({ id: 'input-timeline-clip-1', modality: 'image' }),
            expect.objectContaining({ id: 'input-canvas-node-node-1', modality: 'data' }),
          ]),
          uiContext: expect.objectContaining({
            selectionIds: [
              'sel-text-user-message',
              'sel-attachment-image-1',
              'sel-timeline-clip-1',
              'sel-canvas-node-1',
            ],
            userAnnotation: 'current request',
          }),
        }),
        canvasContext: {
          selectedNodes: [{ nodeId: 'node-1', type: 'shot', summary: 'Shot one' }],
        },
        metadata: expect.objectContaining({
          traceId: 'trace-2',
          mediaModels: {
            video: { providerId: 'runway', modelId: 'gen-3', category: 'video' },
          },
        }),
      }),
    );
    expect(ensureSubAgentEventSubscription).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      agentRunner,
    });
    expect(buildTimelineContextPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'current request',
        workspaceRoot: '/repo',
      }),
    );
  });

  it('patches timeline context when no canvas selection is available', async () => {
    const timelineContextPacket = createTimelineSelectionContextPacket(
      [{ elementId: 'clip-1', trackId: 'v1', mediaType: 'video', sourceUri: 'file://clip.mp4' }],
      { createdAt: 100, playheadMs: 1200 },
    );
    const { input, agentRunner } = createBaseInput({
      getAmbientCanvas: vi.fn(() => []),
      buildTimelineContextPacket: vi.fn(async () => timelineContextPacket),
    });

    await executeAgentTurn(input);

    expect(agentRunner.execute).toHaveBeenCalledWith(
      'current request',
      expect.objectContaining({
        multimodalContextPacket: expect.objectContaining({
          metadata: expect.objectContaining({ conversationId: 'conv-1' }),
          selection: expect.arrayContaining([
            expect.objectContaining({ id: 'sel-text-user-message', kind: 'unknown' }),
            expect.objectContaining({
              id: 'sel-timeline-clip-1',
              kind: 'timeline-clip',
              panel: 'timeline',
            }),
          ]),
          perceptionInputs: expect.arrayContaining([
            expect.objectContaining({ id: 'input-text-user-message', modality: 'text' }),
            expect.objectContaining({ id: 'input-timeline-clip-1', modality: 'image' }),
          ]),
          uiContext: expect.objectContaining({
            selectionIds: ['sel-text-user-message', 'sel-timeline-clip-1'],
            userAnnotation: 'current request',
          }),
        }),
      }),
    );
  });
});

describe('runAgentTurnRuntime', () => {
  it('posts a scoped precondition error when no agent manager is available', async () => {
    const { input } = createBaseInput();
    const postMessage = vi.fn();
    const onErrorMessage = vi.fn();

    await expect(
      runAgentTurnRuntime({
        ...input,
        agentManager: undefined,
        postMessage,
        onErrorMessage,
      }),
    ).resolves.toEqual({ status: 'precondition-unmet', reason: 'no-provider-configured' });

    expect(onErrorMessage).toHaveBeenCalledWith({
      id: 'assistant-1',
      role: 'assistant',
      content: AGENT_TURN_PRECONDITION_MESSAGE,
      timestamp: 123,
      isError: true,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'conv-1',
      message: AGENT_TURN_PRECONDITION_MESSAGE,
    });
  });

  it('posts a precondition error returned by the turn runtime', async () => {
    const { input } = createBaseInput({
      chatModel: { providerId: 'missing', modelId: 'gpt-4.1', category: 'llm' },
      providerSource: {
        getProvider: vi.fn(() => undefined),
      },
    });
    const postMessage = vi.fn();
    const onErrorMessage = vi.fn();

    await expect(
      runAgentTurnRuntime({
        ...input,
        postMessage,
        onErrorMessage,
      }),
    ).resolves.toEqual({ status: 'precondition-unmet', reason: 'chat-provider-not-configured' });

    expect(onErrorMessage).toHaveBeenCalledWith({
      id: 'assistant-1',
      role: 'assistant',
      content: getAgentTurnPreconditionMessage('chat-provider-not-configured'),
      timestamp: 123,
      isError: true,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'conv-1',
      message: getAgentTurnPreconditionMessage('chat-provider-not-configured'),
    });
  });

  it('projects phase changes and tool confirmations to webview messages', async () => {
    const postMessage = vi.fn();
    const onPhaseChange = vi.fn();
    const { input, agentRunner } = createBaseInput({
      processStream: vi.fn(async ({ onPhaseChange: emitPhase }) => {
        emitPhase('tool', 'read_file');
        return {
          accumulatedResponse: '',
          accumulatedThinking: '',
          hasError: false,
          collectedToolCalls: [],
          contentBlocks: [],
        };
      }),
    });

    await runAgentTurnRuntime({
      ...input,
      postMessage,
      onPhaseChange,
    });

    const confirmationListener = vi.mocked(agentRunner.onDidRequestConfirmation).mock.calls[0]?.[0];
    confirmationListener?.({
      toolCallId: 'tool-1',
      toolName: 'read_file',
      action: 'read',
      description: 'Read file',
      details: { path: 'src/app.ts' },
    });

    expect(onPhaseChange).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      phase: 'tool',
      toolName: 'read_file',
      timestamp: 123,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'agentPhase',
      conversationId: 'conv-1',
      phase: 'tool',
      toolName: 'read_file',
      timestamp: 123,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'toolConfirmation',
      conversationId: 'conv-1',
      toolCallId: 'tool-1',
      toolName: 'read_file',
      action: 'read',
      description: 'Read file',
      details: { path: 'src/app.ts' },
    });
  });

  it('posts idle phase and error messages when turn execution fails', async () => {
    const postMessage = vi.fn();
    const onPhaseChange = vi.fn();
    const onExecutionError = vi.fn();
    const onErrorMessage = vi.fn();
    const { input } = createBaseInput({
      processStream: vi.fn(async () => {
        throw new Error('stream failed');
      }),
    });

    await expect(
      runAgentTurnRuntime({
        ...input,
        postMessage,
        onPhaseChange,
        onExecutionError,
        onErrorMessage,
      }),
    ).resolves.toEqual({ status: 'failed', error: expect.any(Error) });

    expect(onExecutionError).toHaveBeenCalledWith(expect.any(Error));
    expect(onErrorMessage).toHaveBeenCalledWith({
      id: 'assistant-1',
      role: 'assistant',
      content: 'stream failed',
      timestamp: 123,
      isError: true,
    });
    expect(onPhaseChange).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      phase: 'idle',
      timestamp: 123,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'agentPhase',
      conversationId: 'conv-1',
      phase: 'idle',
      timestamp: 123,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'conv-1',
      message: 'stream failed',
    });
  });
});

describe('buildAgentTurnRuntimeInput', () => {
  it('assembles host-neutral turn runtime input from host adapters without VSCode dependencies', async () => {
    const activeEditor = {
      type: 'video',
      capabilities: { hasTimeline: true },
      getSelection: vi.fn(() => ({ elementIds: ['clip-1'], trackId: 'v1' })),
      getState: vi.fn(() => ({ currentTime: 12 })),
      getContent: vi.fn(() => ({ clips: ['clip-1'] })),
    };
    const timelineContextRuntime = {
      build: vi.fn(async () => ({ kind: 'timeline-packet' })),
    };
    const agentManager = {
      getOrCreate: vi.fn(() => createAgentRunner()),
      loadHistoryWithContext: vi.fn(),
    };
    const processStream = vi.fn(async () => ({
      accumulatedResponse: 'assembled',
      accumulatedThinking: '',
      hasError: false,
      collectedToolCalls: [],
      contentBlocks: [],
    }));
    const postMessage = vi.fn();
    const onPhaseChange = vi.fn();
    const onErrorMessage = vi.fn();
    const taskManager = {} as never;
    const workflow = {
      workflowDefinitionId: 'neko.workflow.idc.v1',
      workflowRunId: 'run-1',
      workflowNodeId: 'apply',
    };

    const runtimeInput = buildAgentTurnRuntimeInput({
      conversationId: 'conv-1',
      message: 'cut the selected clip',
      platform: { name: 'platform' },
      chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      agentModels: {
        primary: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      },
      llmConfig: {
        reasoningPreset: 'balanced',
        creativityPreset: 'creative',
      },
      llmRuntimeOptions: {
        temperature: 0.7,
        topP: 0.95,
        maxTokens: 4096,
        thinkingBudget: 8192,
        providerOptions: {
          openai: {
            reasoningEffort: 'medium',
            textVerbosity: 'medium',
          },
        },
      },
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'abc' }],
      settings: {
        customSystemPrompt: 'Custom prompt',
        executionMode: 'ask',
        autoExecuteTools: false,
        temperature: 0.2,
        topP: 0.5,
        maxTokens: 1024,
        thinkingBudget: 2048,
      },
      providers: {
        getProvider: vi.fn((providerId: string) => ({
          id: providerId,
          isConfigured: true,
          modelIds: ['gpt-4.1'],
        })),
      },
      runtime: {
        conversations: {
          getMessageCount: vi.fn(() => 1),
          getFullHistory: vi.fn(() => [{ role: 'user', content: 'cut the selected clip' }]),
          addAssistantMessage: vi.fn(),
        },
        getBaseSystemPrompt: vi.fn(() => 'Base prompt'),
        isPlanMode: vi.fn(() => true),
        getActiveSkillState: vi.fn(() => undefined),
        taskManager,
        workflow,
      },
      host: {
        agentManager,
        getWorkspaceRoot: vi.fn(() => '/repo'),
        getWorkspaceIgnoreRules: vi.fn(() => ({ gitignoreRules: ['ignored/'] })),
        getActiveEditor: vi.fn(() => activeEditor),
        getAmbientCanvas: vi.fn(() => [{ nodeId: 'node-1', type: 'shot', summary: 'Shot 1' }]),
        timelineContextRuntime,
        processStream,
        ensureSubAgentEventSubscription: vi.fn(),
        postMessage,
        onPhaseChange,
        onErrorMessage,
        generateMessageId: vi.fn(() => 'assistant-1'),
        now: vi.fn(() => 321),
      },
    });

    expect(runtimeInput.settings).toEqual({
      customSystemPrompt: 'Custom prompt',
      executionMode: 'ask',
      autoExecuteTools: false,
      temperature: 0.2,
      topP: 0.5,
      maxTokens: 1024,
      thinkingBudget: 2048,
    });
    expect(runtimeInput.agentModels).toEqual({
      primary: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
    });
    expect(runtimeInput.llmConfig).toEqual({
      reasoningPreset: 'balanced',
      creativityPreset: 'creative',
    });
    expect(runtimeInput.llmRuntimeOptions).toEqual({
      temperature: 0.7,
      topP: 0.95,
      maxTokens: 4096,
      thinkingBudget: 8192,
      providerOptions: {
        openai: {
          reasoningEffort: 'medium',
          textVerbosity: 'medium',
        },
      },
    });
    expect(runtimeInput.providerSource).not.toHaveProperty('requestedProviderId');
    expect(runtimeInput.providerSource).not.toHaveProperty('requestedModelId');
    expect(runtimeInput.getWorkspaceRoot?.()).toBe('/repo');
    expect(runtimeInput.getWorkspaceIgnoreRules?.()).toEqual({ gitignoreRules: ['ignored/'] });
    expect(runtimeInput.agentManager).toBe(agentManager);
    expect(runtimeInput.agentManager?.nextMessageQueueSnapshotVersion?.('conv-1')).toBeUndefined();
    expect(runtimeInput.taskManager).toBe(taskManager);
    expect(runtimeInput.workflow).toBe(workflow);
    runtimeInput.onErrorMessage?.({
      id: 'error-1',
      role: 'assistant',
      content: 'Failed',
      timestamp: 321,
      isError: true,
    });
    expect(onErrorMessage).toHaveBeenCalledWith('conv-1', {
      id: 'error-1',
      role: 'assistant',
      content: 'Failed',
      timestamp: 321,
      isError: true,
    });

    const context = await runtimeInput.createContext({
      conversationId: 'conv-1',
      message: 'cut the selected clip',
      workspaceRoot: '/repo',
    });
    expect(context).toMatchObject({
      activeEditor,
      workspaceRoot: '/repo',
      projectType: 'video',
    });

    await expect(
      runtimeInput.buildTimelineContextPacket?.({
        context,
        message: 'cut the selected clip',
        workspaceRoot: '/repo',
      }),
    ).resolves.toEqual({ kind: 'timeline-packet' });
    expect(timelineContextRuntime.build).toHaveBeenCalledWith({
      activeEditor,
      message: 'cut the selected clip',
      workspaceRoot: '/repo',
    });

    await runtimeInput.processStream({
      conversationId: 'conv-1',
      messageId: 'assistant-1',
      events: emptyEvents(),
      onPhaseChange: vi.fn(),
    });
    expect(processStream).toHaveBeenCalled();
  });
});

async function* emptyEvents(): AsyncIterable<AgentEvent> {}
