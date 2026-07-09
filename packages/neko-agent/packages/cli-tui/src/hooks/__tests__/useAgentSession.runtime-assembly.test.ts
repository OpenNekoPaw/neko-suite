import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '@neko/agent';
import type { AgentCapabilityProvider, IService } from '@neko/shared';
import type { MediaTask } from '@neko/platform';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import { useAgentStore } from '../../stores/agent-store';
import { useAgentSession } from '../useAgentSession';

const runtimeMocks = vi.hoisted(() => ({
  latestFactoryConfig: undefined as Record<string, unknown> | undefined,
  latestSession: undefined as Record<string, unknown> | undefined,
  tokenCount: 0,
  executeEvents: [] as AgentEvent[],
  recordTaskResultObservation: vi.fn(),
  patchToolResult: vi.fn(),
  createAgentRuntimeSession: vi.fn(),
}));

const platformMocks = vi.hoisted(() => ({
  waitForTask: vi.fn(),
  saveOutputs: vi.fn(),
  onProgress: vi.fn(),
  createCLIPlatform: vi.fn(),
}));

vi.mock('@neko/agent/runtime', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent/runtime')>('@neko/agent/runtime');
  return {
    ...actual,
    createAgentRuntimeSession: runtimeMocks.createAgentRuntimeSession,
  };
});

vi.mock('../../core/platform-bootstrap', async () => {
  const actual =
    await vi.importActual<typeof import('../../core/platform-bootstrap')>(
      '../../core/platform-bootstrap',
    );
  return {
    ...actual,
    createCLIPlatform: platformMocks.createCLIPlatform,
  };
});

let tempRoot: string;

beforeEach(async () => {
  runtimeMocks.latestFactoryConfig = undefined;
  runtimeMocks.latestSession = undefined;
  runtimeMocks.tokenCount = 0;
  runtimeMocks.executeEvents = [];
  runtimeMocks.recordTaskResultObservation.mockResolvedValue({
    observationRecorded: true,
    evidenceRecorded: true,
    followUpRecorded: false,
    eventIds: ['event-1'],
    deliveryDecision: { kind: 'append-observation' },
  });
  runtimeMocks.patchToolResult.mockResolvedValue(undefined);
  runtimeMocks.createAgentRuntimeSession.mockImplementation(
    async (config: Record<string, unknown>) => {
      runtimeMocks.latestFactoryConfig = config;
      const session = createMockAgentSession(runtimeMocks.tokenCount);
      runtimeMocks.latestSession = session;
      return {
        session,
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
    }),
  );
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-runtime-assembly-'));
});

afterEach(async () => {
  cleanup();
  useAgentStore.getState().reset();
  await fs.rm(tempRoot, { recursive: true, force: true });
  runtimeMocks.createAgentRuntimeSession.mockReset();
  runtimeMocks.recordTaskResultObservation.mockReset();
  runtimeMocks.patchToolResult.mockReset();
  platformMocks.createCLIPlatform.mockReset();
});

describe('useAgentSession runtime assembly', () => {
  it('routes TUI context, memory, read roots, and capability fragments through the shared factory', async () => {
    const readyStates: boolean[] = [];

    render(
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
        capabilityPromptFragments: [
          { id: 'probe:prompt-fragment', content: 'Use the probe capability.' },
        ],
      }),
    );
  });

  it('projects live context token estimates into the TUI store', async () => {
    const observedContextTokens: Array<number | null> = [];
    runtimeMocks.tokenCount = 12345;

    render(
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

    expect(useAgentStore.getState().contextTokens.count).toBe(12345);
  });

  it('waits for generated media tasks and records task-result observations through the shared runtime', async () => {
    const submitDone: boolean[] = [];
    const completedTask = createCompletedMediaTask();
    const savedPath = path.join(tempRoot, 'neko', 'generated', 'image', 'task-1.png');
    runtimeMocks.executeEvents = [
      {
        type: 'tool_result',
        toolResult: {
          toolCallId: 'tool-1',
          success: true,
          data: {
            backgroundMode: true,
            taskId: 'task-1',
            type: 'image',
            runId: 'run-1',
            message: 'Generate a cat',
            routedTo: { provider: 'openai' },
          },
        },
      },
      { type: 'done', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
    ];
    platformMocks.waitForTask.mockResolvedValue(completedTask);
    platformMocks.saveOutputs.mockResolvedValue([savedPath]);

    render(
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
    );

    await waitFor(() => submitDone.includes(true));

    expect(platformMocks.waitForTask).toHaveBeenCalledWith('task-1');
    expect(platformMocks.saveOutputs).toHaveBeenCalledWith(
      'task-1',
      path.join(tempRoot, 'neko', 'generated', 'image'),
      expect.any(Object),
    );
    expect(runtimeMocks.patchToolResult).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: 'tool-1',
        dataPatch: expect.objectContaining({
          taskId: 'task-1',
          resultUrls: expect.arrayContaining([
            expect.stringMatching(/^generated-assets\/.+\.png$/),
          ]),
        }),
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
          resultRefs: expect.arrayContaining([
            expect.objectContaining({
              kind: 'resource',
              resourceRef: expect.objectContaining({
                provider: 'generated-asset',
                source: expect.objectContaining({ filePath: savedPath }),
              }),
            }),
          ]),
        }),
        outputData: expect.objectContaining({
          mediaTaskId: 'task-1',
          hostOutputPaths: [savedPath],
          assets: expect.arrayContaining([
            expect.objectContaining({
              localPath: savedPath,
              resourceRef: expect.objectContaining({ provider: 'generated-asset' }),
            }),
          ]),
        }),
      }),
    );
    expect(useAgentStore.getState().usage).toEqual({ input: 1, output: 2, total: 3 });
  });
});

function RuntimeAssemblyProbe(props: {
  readonly config: CLIConfig;
  readonly capabilityProviders: readonly AgentCapabilityProvider[];
  readonly onReady: (ready: boolean) => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    service: createNoopService(),
    capabilityProviders: props.capabilityProviders,
  });

  useEffect(() => {
    props.onReady(session.isReady);
  }, [props, session.isReady]);

  return React.createElement(Text, null, 'runtime-assembly-probe');
}

function RuntimeTokenProbe(props: {
  readonly config: CLIConfig;
  readonly onContextTokens: (count: number | null) => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    service: createNoopService(),
    capabilityProviders: [],
  });

  useEffect(() => {
    if (!session.isReady) {
      return;
    }
    session.syncRuntimeState();
    props.onContextTokens(useAgentStore.getState().contextTokens.count);
  }, [props, session]);

  return React.createElement(Text, null, 'runtime-token-probe');
}

function RuntimeSubmitProbe(props: {
  readonly config: CLIConfig;
  readonly prompt: string;
  readonly onDone: () => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    capabilityProviders: [],
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
    cancel: vi.fn(),
    confirmTool: vi.fn(),
    isRunning: vi.fn(() => false),
    execute: vi.fn(async function* () {
      for (const event of runtimeMocks.executeEvents) {
        yield event;
      }
    }),
    getExecutionMode: vi.fn(() => 'auto'),
    setExecutionMode: vi.fn(),
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
      saveOutputs: platformMocks.saveOutputs,
      onProgress: platformMocks.onProgress.mockReturnValue(() => undefined),
    },
    dispose: vi.fn(),
  };
}

function createCompletedMediaTask(): MediaTask {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const completedAt = new Date('2026-01-01T00:00:03.000Z');
  return {
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
        resultDeliveryPolicy: { kind: 'append-observation' },
      },
    },
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
