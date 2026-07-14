import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@neko/agent';
import type { StageGuardianIssue } from '@neko/agent/skill';
import { createAgentRuntimeSessionMessageQueuePort } from '@neko/agent/runtime';
import type { AgentConversationMessageQueue } from '@neko/agent/runtime';
import { type AgentCapabilityProvider, type IService, type TaskRunScope } from '@neko/shared';
import type { MediaTask } from '@neko/platform';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import {
  useAgentSession,
  type AgentSessionHandle,
  type UseAgentSessionOptions,
} from '../useAgentSession';
import { createTestAgentTerminalPresentation } from '../../presentation/testing';
import { createTuiConversationId } from '../../core/tui-conversation-id';
import {
  createTuiTestRuntime,
  type TuiTestRuntime,
} from '../../__tests__/render-with-presentation';
import {
  TuiApplicationRuntimeProvider,
  useTuiConversationStores,
} from '../../runtime/tui-runtime-context';
import { createMemoryConversationStorageBinding } from '../../host/__tests__/fixtures/memory-conversation-storage';

const runtimeMocks = vi.hoisted(() => ({
  latestFactoryConfig: undefined as Record<string, unknown> | undefined,
  latestSession: undefined as Record<string, unknown> | undefined,
  latestMessageQueue: undefined as AgentConversationMessageQueue | undefined,
  queueEnqueue: vi.fn(),
  queuePromote: vi.fn(),
  queueRemove: vi.fn(),
  queueEdit: vi.fn(),
  queueDrain: vi.fn(),
  tokenCount: 0,
  executeEvents: [] as AgentEvent[],
  executionBlocker: undefined as Promise<void> | undefined,
  releaseExecution: undefined as (() => void) | undefined,
  recordDeliveryKind: 'append-observation' as 'append-observation' | 'auto-resume-agent',
  recordTaskResultObservation: vi.fn(),
  patchToolResult: vi.fn(),
  createAgentRuntimeSession: vi.fn(),
  latestTaskResultObservationRuntimeOptions: undefined as
    Parameters<typeof import('@neko/agent').createAgentTaskResultObservationRuntime>[0] | undefined,
  stageGuardianListener: undefined as ((issue: StageGuardianIssue) => void) | undefined,
}));

const platformMocks = vi.hoisted(() => ({
  waitForTask: vi.fn(),
  saveOutputs: vi.fn(),
  onProgress: vi.fn(),
  createCLIPlatform: vi.fn(),
  perceptionPipeline: { perceive: vi.fn() },
  createNodePerceptionPipeline: vi.fn(),
}));

const mountedRuntimes: TuiTestRuntime[] = [];

vi.mock('@neko/agent/runtime', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent/runtime')>('@neko/agent/runtime');
  return {
    ...actual,
    createAgentRuntimeSession: runtimeMocks.createAgentRuntimeSession,
  };
});

vi.mock('@neko/agent', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent')>('@neko/agent');
  return {
    ...actual,
    createAgentTaskResultObservationRuntime: (
      options: Parameters<typeof actual.createAgentTaskResultObservationRuntime>[0],
    ) => {
      runtimeMocks.latestTaskResultObservationRuntimeOptions = options;
      return actual.createAgentTaskResultObservationRuntime(options);
    },
  };
});

vi.mock('../../core/platform-bootstrap', async () => {
  const actual = await vi.importActual<typeof import('../../core/platform-bootstrap')>(
    '../../core/platform-bootstrap',
  );
  return {
    ...actual,
    createCLIPlatform: platformMocks.createCLIPlatform,
  };
});

vi.mock('../../host/node-perception-pipeline', () => ({
  createNodePerceptionPipeline: platformMocks.createNodePerceptionPipeline,
}));

let tempRoot: string;

beforeEach(async () => {
  runtimeMocks.latestFactoryConfig = undefined;
  runtimeMocks.latestSession = undefined;
  runtimeMocks.latestMessageQueue = undefined;
  runtimeMocks.latestTaskResultObservationRuntimeOptions = undefined;
  runtimeMocks.stageGuardianListener = undefined;
  runtimeMocks.queueEnqueue.mockReset();
  runtimeMocks.queuePromote.mockReset();
  runtimeMocks.queueRemove.mockReset();
  runtimeMocks.queueEdit.mockReset();
  runtimeMocks.queueDrain.mockReset();
  runtimeMocks.tokenCount = 0;
  runtimeMocks.executeEvents = [];
  runtimeMocks.executionBlocker = undefined;
  runtimeMocks.releaseExecution = undefined;
  runtimeMocks.recordDeliveryKind = 'append-observation';
  runtimeMocks.recordTaskResultObservation.mockImplementation(async (input) => {
    if (runtimeMocks.recordDeliveryKind === 'auto-resume-agent') {
      return {
        observationRecorded: true,
        evidenceRecorded: true,
        followUpRecorded: true,
        eventIds: ['event-1'],
        deliveryDecision: {
          kind: 'auto-resume-agent' as const,
          followUpRequest: {
            id: 'followup-1',
            conversationId: input.observation.conversationId,
            runId: input.observation.runId,
            observationId: input.observation.id,
            taskId: input.observation.taskId,
            policy: { kind: 'auto-resume-agent' as const, prompt: 'Continue' },
            prompt: 'Continue from the completed async task result.',
            createdAt: 30,
          },
        },
      };
    }
    return {
      observationRecorded: true,
      evidenceRecorded: true,
      followUpRecorded: false,
      eventIds: ['event-1'],
      deliveryDecision: { kind: 'append-observation' as const },
    };
  });
  runtimeMocks.patchToolResult.mockResolvedValue(undefined);
  runtimeMocks.createAgentRuntimeSession.mockImplementation(
    async (config: Record<string, unknown>) => {
      runtimeMocks.latestFactoryConfig = config;
      const session = createMockAgentSession(runtimeMocks.tokenCount);
      const messageQueue = createAgentRuntimeSessionMessageQueuePort(
        String(config.conversationId ?? ''),
      );
      const queue = messageQueue.require();
      runtimeMocks.latestSession = session;
      runtimeMocks.latestMessageQueue = queue;
      runtimeMocks.queueEnqueue.mockImplementation(queue.enqueue.bind(queue));
      runtimeMocks.queuePromote.mockImplementation(queue.promote.bind(queue));
      runtimeMocks.queueRemove.mockImplementation(queue.remove.bind(queue));
      runtimeMocks.queueEdit.mockImplementation(queue.edit.bind(queue));
      runtimeMocks.queueDrain.mockImplementation(queue.drain.bind(queue));
      queue.enqueue = runtimeMocks.queueEnqueue;
      queue.promote = runtimeMocks.queuePromote;
      queue.remove = runtimeMocks.queueRemove;
      queue.edit = runtimeMocks.queueEdit;
      queue.drain = runtimeMocks.queueDrain;
      return {
        session,
        messageQueue,
        promptBuilder: createMockPromptBuilder(),
        effectiveSystemPrompt: String(config.systemPrompt ?? ''),
      };
    },
  );
  platformMocks.waitForTask.mockReset();
  platformMocks.saveOutputs.mockReset();
  platformMocks.onProgress.mockReset();
  platformMocks.createCLIPlatform.mockImplementation(
    (options: { readonly taskManager?: unknown }) => ({
      platform: createMockPlatform(),
      service: createNoopService(),
      taskManager: options.taskManager,
      perceptionAssetLoader: { load: vi.fn() },
    }),
  );
  platformMocks.createNodePerceptionPipeline.mockReturnValue(platformMocks.perceptionPipeline);
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-runtime-assembly-'));
});

afterEach(async () => {
  cleanup();
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const runtime of mountedRuntimes.splice(0)) {
    runtime.application.dispose();
  }
  await fs.rm(tempRoot, { recursive: true, force: true });
  runtimeMocks.createAgentRuntimeSession.mockReset();
  runtimeMocks.recordTaskResultObservation.mockReset();
  runtimeMocks.patchToolResult.mockReset();
  platformMocks.createCLIPlatform.mockReset();
  platformMocks.createNodePerceptionPipeline.mockReset();
});

describe('useAgentSession runtime assembly', () => {
  it('routes TUI context, memory, read roots, and capability fragments through the shared factory', async () => {
    const readyStates: boolean[] = [];

    renderWithSessionRuntime(
      React.createElement(RuntimeAssemblyProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
          contextSettings: { maxTokens: 12345 },
        },
        capabilityProviders: [createPromptFragmentProvider()],
        onReady: (ready: boolean) => {
          readyStates.push(ready);
        },
      }),
    );

    await waitFor(() => readyStates.includes(true));

    expect(runtimeMocks.latestFactoryConfig).toEqual(
      expect.objectContaining({
        workspaceRoot: tempRoot,
        authorizedReadRoots: expect.arrayContaining([tempRoot]),
        contextSettings: { maxTokens: 12345 },
        projectMemoryFilePath: path.join(tempRoot, '.neko', 'memory.md'),
        capabilityPromptFragments: expect.arrayContaining([
          { id: 'probe:prompt-fragment', content: 'Use the probe capability.' },
          expect.objectContaining({ id: 'external-research:usage-boundary' }),
        ]),
      }),
    );
  });

  it('installs the configured media perception pipeline into standalone TUI sessions', async () => {
    const readyStates: boolean[] = [];

    renderWithSessionRuntime(
      React.createElement(RuntimeAssemblyProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        useStandalonePlatform: true,
        capabilityProviders: [],
        onReady: (ready: boolean) => {
          readyStates.push(ready);
        },
      }),
    );

    await waitFor(() => readyStates.includes(true));

    expect(platformMocks.createNodePerceptionPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: expect.any(Object),
        service: expect.any(Object),
        assetLoader: expect.any(Object),
        workspaceRoot: tempRoot,
        assetIndex: expect.any(Object),
      }),
    );
    expect(runtimeMocks.latestFactoryConfig).toEqual(
      expect.objectContaining({
        perceptionPipeline: platformMocks.perceptionPipeline,
      }),
    );
  });
  it('keeps UI locale independent while propagating prompt locale into runtime assembly', async () => {
    const snapshots: Array<{ readonly ready: boolean; readonly modeDescription?: string }> = [];

    renderWithSessionRuntime(
      React.createElement(LocaleSeparationProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        onSnapshot: (snapshot) => {
          snapshots.push(snapshot);
        },
      }),
    );

    await waitFor(() => snapshots.some((snapshot) => snapshot.ready));

    expect(snapshots.at(-1)?.modeDescription).toBe('Show or switch session mode');
    expect(runtimeMocks.latestFactoryConfig).toEqual(
      expect.objectContaining({ promptLocale: 'zh-cn' }),
    );
  });

  it('projects StageGuardian diagnostics through the invocation-local translator', async () => {
    renderWithSessionRuntime(
      React.createElement(StageGuardianPresentationProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
      }),
    );

    await waitFor(() => runtimeMocks.stageGuardianListener !== undefined);
    runtimeMocks.stageGuardianListener?.({
      code: 'stage-out-of-order',
      stage: 'apply',
      at: 1,
    });

    expect(
      currentRuntime().conversation.stores.conversation.getState().messages.at(-1)?.content,
    ).toBe(
      '[stage-out-of-order] 未先进入 Draft / Plan 就进入了 Apply；高风险工具调用应按 ADR §3.2 先经过前置阶段。',
    );
  });

  it('projects live context token estimates into the TUI store', async () => {
    const observedContextTokens: Array<number | null> = [];
    runtimeMocks.tokenCount = 12345;

    renderWithSessionRuntime(
      React.createElement(RuntimeTokenProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        onContextTokens: (count: number | null) => {
          observedContextTokens.push(count);
        },
      }),
    );

    await waitFor(() => observedContextTokens.includes(12345));

    expect(currentRuntime().conversation.stores.agent.getState().contextTokens.count).toBe(12345);
  });

  it('passes configured perception model selections as turn metadata', async () => {
    const submitDone: boolean[] = [];
    runtimeMocks.executeEvents = [
      { type: 'done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ];

    renderWithSessionRuntime(
      React.createElement(RuntimeSubmitProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          provider: 'deepseek-chat',
          model: 'deepseek-v4-flash',
          providerRequiresApiKey: false,
          chatModel: {
            providerId: 'deepseek-chat',
            modelId: 'deepseek-v4-flash',
            capabilities: ['chat'],
          },
          perceptionModels: { image: 'nekoapi-chat:gpt-5.5' },
        },
        prompt: 'Analyze the generated image.',
        onDone: () => submitDone.push(true),
      }),
    );

    await waitFor(() => submitDone.includes(true));
    const session = runtimeMocks.latestSession as { execute: ReturnType<typeof vi.fn> };

    expect(session.execute.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          understandingModels: {
            image: expect.objectContaining({ providerId: 'nekoapi-chat', modelId: 'gpt-5.5' }),
          },
        }),
      }),
    );
  });

  it('waits for generated media tasks and records task-result observations through the shared runtime', async () => {
    const submitDone: boolean[] = [];
    const conversationId = createTuiConversationId(tempRoot);
    const taskScope = createRuntimeTaskScope('task-1', conversationId);
    const completedTask = createCompletedMediaTask({ taskScope });
    const savedPath = path.join(tempRoot, 'neko', 'generated', 'image', 'task-1.png');
    await fs.mkdir(path.dirname(savedPath), { recursive: true });
    await fs.writeFile(savedPath, Buffer.from('png-fixture'));
    runtimeMocks.executeEvents = [
      {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'tool-1',
          success: true,
          data: {
            backgroundMode: true,
            conversationId: taskScope.conversationId,
            runId: taskScope.runId,
            taskId: 'task-1',
            taskScope,
            type: 'image',
            message: 'Generate a cat',
            routedTo: { provider: 'openai' },
          },
        },
      },
      { type: 'done', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
    ];
    platformMocks.waitForTask.mockResolvedValue(completedTask);
    platformMocks.saveOutputs.mockResolvedValue([savedPath]);

    renderWithSessionRuntime(
      React.createElement(RuntimeSubmitProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        prompt: 'Generate a cat image',
        onDone: () => {
          submitDone.push(true);
        },
      }),
      conversationId,
    );

    await waitFor(() => submitDone.includes(true));
    expect(
      currentRuntime()
        .conversation.stores.conversation.getState()
        .messages.filter((message) => message.isError)
        .map((message) => message.content),
    ).toEqual([]);
    expect(platformMocks.waitForTask).toHaveBeenCalledWith(taskScope);
    expect(platformMocks.saveOutputs).toHaveBeenCalledWith(
      taskScope,
      path.join(tempRoot, 'neko', 'generated', 'image'),
      expect.any(Object),
    );
    await waitFor(() => runtimeMocks.patchToolResult.mock.calls.length > 0);

    expect(runtimeMocks.patchToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: 'tool-1',
        dataPatch: expect.objectContaining({
          taskId: 'task-1',
          resultUrls: expect.arrayContaining([expect.any(String)]),
          resultAssetRefs: [
            expect.objectContaining({
              assetId: expect.any(String),
              uri: expect.stringMatching(/^generated-assets\//),
              mimeType: 'image/png',
            }),
          ],
          thumbnailAssetRef: expect.objectContaining({
            assetId: expect.any(String),
            uri: expect.stringMatching(/^generated-assets\//),
            mimeType: 'image/png',
          }),
        }),
        perceptionCards: [
          expect.objectContaining({
            modality: 'image',
            perceptual: expect.objectContaining({
              thumbnailRef: expect.objectContaining({
                assetId: expect.any(String),
                uri: expect.stringMatching(/^generated-assets\//),
                mimeType: 'image/png',
              }),
            }),
          }),
        ],
      }),
    );
    expect(runtimeMocks.recordTaskResultObservation).toHaveBeenCalledWith(
      expect.objectContaining({
        observation: expect.objectContaining({
          conversationId: expect.any(String),
          runId: 'run-1',
          taskId: 'task-1',
          status: 'completed',
          source: 'media-task',
        }),
        outputData: expect.objectContaining({
          mediaTaskId: 'task-1',
        }),
      }),
    );
    expect(currentRuntime().conversation.stores.agent.getState().usage).toEqual({
      input: 1,
      output: 2,
      total: 3,
    });
  });

  it('routes running task-result continuations through the runtime queue with continuation authorship', async () => {
    runtimeMocks.executionBlocker = new Promise<void>((resolve) => {
      runtimeMocks.releaseExecution = resolve;
    });
    let sessionHandle: AgentSessionHandle | undefined;

    renderWithSessionRuntime(
      React.createElement(RuntimeSessionProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        onReady: (session) => {
          sessionHandle = session;
        },
      }),
    );

    await waitFor(() => Boolean(sessionHandle));
    const activeTurn = sessionHandle!.submit('Active turn');
    await waitFor(() => currentRuntime().conversation.stores.agent.getState().status === 'running');

    const queue = runtimeMocks.latestMessageQueue!;
    const agent = runtimeMocks.latestTaskResultObservationRuntimeOptions?.agents.get(
      queue.conversationId,
    );
    const queued = agent?.enqueuePendingMessage?.({
      conversationId: queue.conversationId,
      content: 'Continue from task result',
      source: 'task-result-continuation',
      displayKind: 'task-continuation',
      metadata: {
        observationId: 'observation-1',
        taskId: 'task-1',
        runId: 'run-1',
        status: 'queued',
        policy: 'auto-resume-agent',
      },
    });

    expect(queued).toEqual(
      expect.objectContaining({
        content: 'Continue from task result',
        source: 'task-result-continuation',
        displayKind: 'task-continuation',
        metadata: expect.objectContaining({
          observationId: 'observation-1',
          taskId: 'task-1',
          runId: 'run-1',
        }),
      }),
    );
    expect(runtimeMocks.queueEnqueue).toHaveBeenCalledWith({
      content: 'Continue from task result',
      source: 'task-result-continuation',
      displayKind: 'task-continuation',
      metadata: {
        observationId: 'observation-1',
        taskId: 'task-1',
        runId: 'run-1',
        status: 'queued',
        policy: 'auto-resume-agent',
      },
    });
    expect(sessionHandle!.getMessageQueueSnapshot()?.items).toEqual([
      expect.objectContaining({
        source: 'task-result-continuation',
        metadata: expect.objectContaining({ taskId: 'task-1', observationId: 'observation-1' }),
      }),
    ]);
    expect(
      currentRuntime()
        .conversation.stores.conversation.getState()
        .messages.some((message) => message.content === 'Continue from task result'),
    ).toBe(false);

    sessionHandle!.cancel();
    await activeTurn;
  });

  it('preserves and pauses queued user messages after cancellation until send-next resumes them', async () => {
    runtimeMocks.executionBlocker = new Promise<void>((resolve) => {
      runtimeMocks.releaseExecution = resolve;
    });
    let sessionHandle: AgentSessionHandle | undefined;

    renderWithSessionRuntime(
      React.createElement(RuntimeSessionProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        onReady: (session) => {
          sessionHandle = session;
        },
      }),
    );

    await waitFor(() => Boolean(sessionHandle));
    const activeTurn = sessionHandle!.submit('Active turn');
    await waitFor(() => currentRuntime().conversation.stores.agent.getState().status === 'running');
    await sessionHandle!.submit('Queued follow-up');

    const queuedItem = sessionHandle!.getMessageQueueSnapshot()?.items[0];
    expect(queuedItem).toEqual(expect.objectContaining({ content: 'Queued follow-up' }));
    expect(runtimeMocks.queueEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Queued follow-up', source: 'user' }),
    );
    expect(
      currentRuntime()
        .conversation.stores.conversation.getState()
        .messages.some((message) => message.content === 'Queued follow-up'),
    ).toBe(false);

    sessionHandle!.cancel();
    await activeTurn;

    const runtimeSession = runtimeMocks.latestSession as {
      execute: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
    };
    expect(runtimeSession.cancel).toHaveBeenCalledTimes(1);
    expect(runtimeSession.execute).toHaveBeenCalledTimes(1);
    expect(
      currentRuntime().conversation.stores.agent.getState().messageQueue.pausedAfterCancel,
    ).toBe(true);
    expect(sessionHandle!.getMessageQueueSnapshot()?.items).toEqual([
      expect.objectContaining({ id: queuedItem!.id, content: 'Queued follow-up' }),
    ]);

    sessionHandle!.promoteQueuedMessage(queuedItem!.id);
    expect(runtimeMocks.queuePromote).toHaveBeenCalledWith(queuedItem!.id);
    await waitFor(() => runtimeSession.execute.mock.calls.length === 2);
    await waitFor(() => sessionHandle!.getMessageQueueSnapshot()?.pendingCount === 0);

    expect(
      currentRuntime().conversation.stores.agent.getState().messageQueue.pausedAfterCancel,
    ).toBe(false);
    expect(runtimeMocks.queueDrain).toHaveBeenCalled();
    expect(runtimeSession.execute.mock.calls[1]?.[0]).toBe('Queued follow-up');
    expect(
      currentRuntime()
        .conversation.stores.conversation.getState()
        .messages.some(
          (message) => message.role === 'user' && message.content === 'Queued follow-up',
        ),
    ).toBe(true);
  });

  it('dispatches task-result continuations without adding user transcript messages', async () => {
    const readyStates: boolean[] = [];
    runtimeMocks.executeEvents = [
      { type: 'done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
    ];

    renderWithSessionRuntime(
      React.createElement(RuntimeAssemblyProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        capabilityProviders: [],
        onReady: (ready: boolean) => {
          readyStates.push(ready);
        },
      }),
    );

    await waitFor(() => readyStates.includes(true));
    await runtimeMocks.latestTaskResultObservationRuntimeOptions?.continuation?.dispatchIdleAgentTurn?.(
      {
        id: 'followup-1',
        conversationId: 'conv-1',
        runId: 'run-1',
        observationId: 'obs-1',
        taskId: 'task-1',
        policy: { kind: 'auto-resume-agent', prompt: 'Continue' },
        prompt: 'Continue from the completed async task result.',
        createdAt: 30,
      },
    );

    const session = runtimeMocks.latestSession as { execute: ReturnType<typeof vi.fn> };
    expect(session.execute).toHaveBeenCalledWith(
      'Continue from the completed async task result.',
      expect.any(Object),
    );
    expect(
      currentRuntime()
        .conversation.stores.conversation.getState()
        .messages.some(
          (message) =>
            message.role === 'user' &&
            message.content.includes('Continue from the completed async task result.'),
        ),
    ).toBe(false);
    expect(
      currentRuntime()
        .conversation.stores.conversation.getState()
        .messages.some(
          (message) => message.role === 'system' && message.source === 'task-result-continuation',
        ),
    ).toBe(true);
  });
});

function RuntimeAssemblyProbe(props: {
  readonly config: CLIConfig;
  readonly capabilityProviders: readonly AgentCapabilityProvider[];
  readonly onReady: (ready: boolean) => void;
  readonly service?: IService;
  readonly useStandalonePlatform?: boolean;
}): React.JSX.Element {
  const injectedService = props.useStandalonePlatform
    ? undefined
    : (props.service ?? createNoopService());
  const session = useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('en'),
    promptLocale: 'en',
    ...(injectedService ? { service: injectedService } : {}),
    capabilityProviders: props.capabilityProviders,
    createConversationStorage: createMemoryConversationStorageBinding,
  });

  useEffect(() => {
    props.onReady(session.isReady);
  }, [props, session.isReady]);

  return React.createElement(Text, null, 'runtime-assembly-probe');
}

function LocaleSeparationProbe(props: {
  readonly config: CLIConfig;
  readonly onSnapshot: (snapshot: {
    readonly ready: boolean;
    readonly modeDescription?: string;
  }) => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('en'),
    promptLocale: 'zh-cn',
    service: createNoopService(),
    capabilityProviders: [],
    createConversationStorage: createMemoryConversationStorageBinding,
  });

  useEffect(() => {
    props.onSnapshot({
      ready: session.isReady,
      modeDescription: session.slashCommands.find((command) => command.name === 'mode')
        ?.description,
    });
  }, [props, session.isReady, session.slashCommands]);

  return React.createElement(Text, null, 'locale-separation-probe');
}

function StageGuardianPresentationProbe(props: { readonly config: CLIConfig }): React.JSX.Element {
  useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('zh-cn'),
    promptLocale: 'zh-cn',
    service: createNoopService(),
    capabilityProviders: [],
    createConversationStorage: createMemoryConversationStorageBinding,
  });

  return React.createElement(Text, null, 'stage-guardian-presentation-probe');
}

function RuntimeTokenProbe(props: {
  readonly config: CLIConfig;
  readonly onContextTokens: (count: number | null) => void;
}): React.JSX.Element {
  const stores = useTuiConversationStores();
  const session = useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('en'),
    promptLocale: 'en',
    service: createNoopService(),
    capabilityProviders: [],
    createConversationStorage: createMemoryConversationStorageBinding,
  });

  useEffect(() => {
    if (!session.isReady) {
      return;
    }
    session.syncRuntimeState();
    props.onContextTokens(stores.agent.getState().contextTokens.count);
  }, [props, session, stores]);

  return React.createElement(Text, null, 'runtime-token-probe');
}

function RuntimeSubmitProbe(props: {
  readonly config: CLIConfig;
  readonly prompt: string;
  readonly onDone: () => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('en'),
    promptLocale: 'en',
    capabilityProviders: [],
    createConversationStorage: createMemoryConversationStorageBinding,
  });

  useEffect(() => {
    if (!session.isReady) {
      return;
    }
    let cancelled = false;
    void session.submit(props.prompt).then(() => {
      if (!cancelled) {
        props.onDone();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props, session]);

  return React.createElement(Text, null, 'runtime-submit-probe');
}

function RuntimeSessionProbe(props: {
  readonly config: CLIConfig;
  readonly onReady: (session: AgentSessionHandle) => void;
  readonly createConversationStorage?: NonNullable<
    UseAgentSessionOptions['createConversationStorage']
  >;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    presentation: createTestAgentTerminalPresentation('en'),
    promptLocale: 'en',
    capabilityProviders: [],
    createConversationStorage:
      props.createConversationStorage ?? createMemoryConversationStorageBinding,
  });

  useEffect(() => {
    if (session.isReady) {
      props.onReady(session);
    }
  }, [props, session]);

  return React.createElement(Text, null, 'runtime-session-probe');
}

function createPromptFragmentProvider(): AgentCapabilityProvider {
  return {
    id: 'probe-runtime',
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }],
    requirements: { contentAccess: false },
    getTools: () => [],
    getPromptFragments: () => [
      { id: 'probe:prompt-fragment', content: 'Use the probe capability.' },
    ],
  };
}

function createNoopService(): IService {
  return {
    async chat() {
      return {
        id: 'noop-response',
        model: 'noop-model',
        message: { role: 'assistant', content: '' },
        finishReason: 'stop',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    },
    async *chatStream() {
      yield { type: 'done' as const };
    },
    async embed(texts: string[]) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

function createMockAgentSession(tokenCount: number): Record<string, unknown> {
  return {
    dispose: vi.fn(),
    loadHistory: vi.fn(),
    getTokenCount: vi.fn(() => tokenCount),
    getHistory: vi.fn(() => []),
    configure: vi.fn(),
    clearHistory: vi.fn(),
    cancel: vi.fn(() => runtimeMocks.releaseExecution?.()),
    confirmTool: vi.fn(),
    isRunning: vi.fn(() => false),
    execute: vi.fn(async function* () {
      await runtimeMocks.executionBlocker;
      const events = runtimeMocks.executeEventBatches?.shift() ?? runtimeMocks.executeEvents;
      for (const event of events) {
        yield event;
      }
    }),
    getExecutionMode: vi.fn(() => 'auto'),
    setExecutionMode: vi.fn(),
    getStageGuardianIssues: vi.fn(() => []),
    onStageGuardianIssue: vi.fn((listener: (issue: StageGuardianIssue) => void) => {
      runtimeMocks.stageGuardianListener = listener;
      return vi.fn();
    }),
    compressContext: vi.fn(),
    setSkillProvider: vi.fn(),
    clearActiveSkill: vi.fn(),
    applySkillInjection: vi.fn(),
    recordTaskResultObservation: runtimeMocks.recordTaskResultObservation,
    patchToolResult: runtimeMocks.patchToolResult,
  };
}

function createMockPlatform(): Record<string, unknown> {
  return {
    media: {
      waitForTask: platformMocks.waitForTask,
      config: {
        resolveModelRefForPurpose: vi.fn(),
        getModel: vi.fn(),
      },
      saveOutputs: platformMocks.saveOutputs,
      onProgress: platformMocks.onProgress.mockReturnValue(() => undefined),
    },
    dispose: vi.fn(),
  };
}

function renderWithSessionRuntime(
  node: React.ReactElement<{ readonly config: CLIConfig }>,
  conversationId = createTuiConversationId(node.props.config.workDir),
): ReturnType<typeof render> {
  const runtime = createTuiTestRuntime(node.props.config, conversationId);
  mountedRuntimes.push(runtime);
  return render(
    React.createElement(TuiApplicationRuntimeProvider, {
      runtime: runtime.application,
      children: node,
    }),
  );
}

function currentRuntime(): TuiTestRuntime {
  const runtime = mountedRuntimes.at(-1);
  if (!runtime) {
    throw new Error('Expected a mounted TUI test runtime.');
  }
  return runtime;
}

function createCompletedMediaTask(
  options: { readonly deliveryPolicy?: unknown; readonly taskScope?: TaskRunScope } = {},
): MediaTask {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const completedAt = new Date('2026-01-01T00:00:03.000Z');
  return {
    scope: options.taskScope ?? createRuntimeTaskScope('task-1'),
    id: 'task-1',
    type: 'text-to-image',
    status: 'completed',
    progress: 100,
    providerId: 'openai',
    modelId: 'gpt-image-1',
    createdAt,
    updatedAt: completedAt,
    completedAt,
    outputs: [{ type: 'image', url: 'https://cdn.example.test/task-1.png', mimeType: 'image/png' }],
    request: {
      prompt: 'Generate a cat',
      metadata: {
        runId: 'run-1',
        runStartedAt: 101,
        resultDeliveryPolicy: options.deliveryPolicy ?? { kind: 'append-observation' },
      },
    },
  };
}

function createRuntimeTaskScope(
  childRunId: string,
  conversationId = createTuiConversationId(tempRoot),
): TaskRunScope {
  return {
    conversationId,
    runId: 'run-1',
    parentRunId: 'run-1',
    childRunId,
    childKind: 'task',
  };
}

function createMockPromptBuilder(): Record<string, unknown> {
  return {
    getAgentsContent: vi.fn(() => null),
    getAgentsSource: vi.fn(() => null),
    buildAgentsOverlay: vi.fn(() => null),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for runtime assembly.');
}
