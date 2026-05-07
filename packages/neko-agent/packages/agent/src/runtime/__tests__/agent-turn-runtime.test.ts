import { describe, expect, it, vi } from 'vitest';
import { buildAgentTurnForWebviewRuntimeInput } from '../agent-turn-assembly';
import {
  AGENT_TURN_FALLBACK_MESSAGE,
  executeAgentTurn,
  getAgentTurnFallbackMessage,
  runAgentTurnForWebviewRuntime,
  type AgentTurnRunner,
  type ExecuteAgentTurnInput,
} from '../agent-turn-runtime';
import { createTimelineSelectionContextPacket } from '../multimodal-context-packet';
import type { AgentEvent } from '../../session/types';

type TestPlatform = { readonly name: string };
type TestContext = {
  workspaceRoot?: string;
  metadata?: Record<string, unknown>;
  imageAttachments?: readonly unknown[];
};
type TestHistoryMessage = { readonly role: string; readonly content: string };
type TestProvider = { readonly id: string; readonly isConfigured: boolean };

function createAgentRunner(
  overrides: {
    readonly history?: readonly unknown[];
    readonly events?: AsyncIterable<AgentEvent>;
  } = {},
): AgentTurnRunner<TestPlatform, TestContext> {
  return {
    getHistory: vi.fn(() => overrides.history ?? []),
    configure: vi.fn(async () => undefined),
    execute: vi.fn(() => overrides.events ?? emptyEvents()),
    applySkillInjection: vi.fn(),
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

  const input = {
    conversationId: 'conv-1',
    message: 'current request',
    platform: { name: 'platform' },
    settings: {
      executionMode: 'ask' as const,
      autoExecuteTools: true,
      temperature: 0.7,
    },
    providerSource: {
      selectedProviderId: 'openai',
      getProvider: vi.fn(() => ({ id: 'openai', isConfigured: true })),
      getDefaultProvider: vi.fn(() => ({ id: 'default', isConfigured: true })),
    },
    agentManager: {
      getOrCreate: vi.fn(() => agentRunner),
      loadHistoryWithContext: vi.fn(),
    },
    conversations: {
      getConversationMessageCount: vi.fn(() => fullHistory.length),
      getFullHistory: vi.fn(() => fullHistory),
      addAssistantMessage: vi.fn(),
    },
    getBaseSystemPrompt: vi.fn(() => 'base system prompt'),
    isPlanMode: vi.fn(() => false),
    getWorkspaceRoot: vi.fn(() => '/repo'),
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
  it('provides a shared fallback message for host adapters', () => {
    expect(getAgentTurnFallbackMessage('no-provider-configured')).toBe(AGENT_TURN_FALLBACK_MESSAGE);
    expect(getAgentTurnFallbackMessage('missing-platform')).toBe(AGENT_TURN_FALLBACK_MESSAGE);
  });

  it('returns fallback when no provider is configured', async () => {
    const { input } = createBaseInput({
      providerSource: {
        selectedProviderId: 'missing',
        getProvider: vi.fn(() => undefined),
        getDefaultProvider: vi.fn(() => undefined),
      },
    });

    await expect(executeAgentTurn(input)).resolves.toEqual({
      status: 'fallback',
      reason: 'no-provider-configured',
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

describe('runAgentTurnForWebviewRuntime', () => {
  it('posts a scoped fallback error when no agent manager is available', async () => {
    const { input } = createBaseInput();
    const postMessage = vi.fn();

    await expect(
      runAgentTurnForWebviewRuntime({
        ...input,
        agentManager: undefined,
        postMessage,
      }),
    ).resolves.toEqual({ status: 'fallback', reason: 'no-provider-configured' });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'conv-1',
      message: AGENT_TURN_FALLBACK_MESSAGE,
    });
  });

  it('posts a fallback error returned by the turn runtime', async () => {
    const { input } = createBaseInput({
      providerSource: {
        selectedProviderId: 'missing',
        getProvider: vi.fn(() => undefined),
        getDefaultProvider: vi.fn(() => undefined),
      },
    });
    const postMessage = vi.fn();

    await expect(
      runAgentTurnForWebviewRuntime({
        ...input,
        postMessage,
      }),
    ).resolves.toEqual({ status: 'fallback', reason: 'no-provider-configured' });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'error',
      conversationId: 'conv-1',
      message: AGENT_TURN_FALLBACK_MESSAGE,
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

    await runAgentTurnForWebviewRuntime({
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
    const { input } = createBaseInput({
      processStream: vi.fn(async () => {
        throw new Error('stream failed');
      }),
    });

    await expect(
      runAgentTurnForWebviewRuntime({
        ...input,
        postMessage,
        onPhaseChange,
        onExecutionError,
      }),
    ).resolves.toEqual({ status: 'failed', error: expect.any(Error) });

    expect(onExecutionError).toHaveBeenCalledWith(expect.any(Error));
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

describe('buildAgentTurnForWebviewRuntimeInput', () => {
  it('assembles webview turn runtime input from host adapters without VSCode dependencies', async () => {
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
    const taskManager = {} as never;
    const workflow = {
      workflowDefinitionId: 'neko.workflow.idc.v1',
      workflowRunId: 'run-1',
      workflowNodeId: 'apply',
    };

    const runtimeInput = buildAgentTurnForWebviewRuntimeInput({
      conversationId: 'conv-1',
      message: 'cut the selected clip',
      platform: { name: 'platform' },
      chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      imageAttachments: [{ type: 'base64', media_type: 'image/png', data: 'abc' }],
      settings: {
        selectedProviderId: 'anthropic',
        customSystemPrompt: 'Custom prompt',
        executionMode: 'ask',
        autoExecuteTools: false,
        temperature: 0.2,
        maxTokens: 1024,
        thinkingBudget: 2048,
      },
      providers: {
        getProvider: vi.fn((providerId: string) => ({ id: providerId, isConfigured: true })),
        getDefaultProvider: vi.fn(() => ({ id: 'default', isConfigured: true })),
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
        getActiveEditor: vi.fn(() => activeEditor),
        getAmbientCanvas: vi.fn(() => [{ nodeId: 'node-1', type: 'shot', summary: 'Shot 1' }]),
        timelineContextRuntime,
        processStream,
        ensureSubAgentEventSubscription: vi.fn(),
        postMessage,
        onPhaseChange,
        generateMessageId: vi.fn(() => 'assistant-1'),
        now: vi.fn(() => 321),
      },
    });

    expect(runtimeInput.settings).toEqual({
      customSystemPrompt: 'Custom prompt',
      executionMode: 'ask',
      autoExecuteTools: false,
      temperature: 0.2,
      maxTokens: 1024,
      thinkingBudget: 2048,
    });
    expect(runtimeInput.providerSource.selectedProviderId).toBe('anthropic');
    expect(runtimeInput.providerSource.requestedProviderId).toBe('openai');
    expect(runtimeInput.getWorkspaceRoot?.()).toBe('/repo');
    expect(runtimeInput.agentManager).toBe(agentManager);
    expect(runtimeInput.taskManager).toBe(taskManager);
    expect(runtimeInput.workflow).toBe(workflow);

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
      events: emptyEvents(),
      onPhaseChange: vi.fn(),
    });
    expect(processStream).toHaveBeenCalled();
  });
});

async function* emptyEvents(): AsyncIterable<AgentEvent> {}
