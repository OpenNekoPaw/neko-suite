/**
 * AgentSession Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentSession } from '../agent-session';
import { backfillReadImagePerceptionResults } from '../read-image-perception-backfill';
import { PLAN_MODE_SYSTEM_REMINDER } from '../../permission/types';
import { ToolRegistry } from '../../tools';
import type { AgentSessionConfig, AgentEvent } from '../types';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  TOOL_NAMES_MEDIA,
  TOOL_NAMES_PERCEPTION,
  createTool,
  createSubagentReviewEvidence,
} from '@neko/shared';
import {
  createQualityReviewValidationAdapter,
  createValidationCoordinatorFactory,
  getBuiltinSkills,
  registerBuiltinToolGroups,
  getScriptGenerationSkill,
} from '@neko/skills';
import type {
  AgentContext,
  IService,
  IToolRegistry,
  AgentStep,
  ChatMessage,
  ExecutorHooks,
  IProjectMemoryManager,
  ServiceOptions,
  ServiceResponse,
  SkillLifecycleProjection,
  StreamChunk,
  ToolResultWithMeta,
  QualityGateResult,
  ResourceRef,
} from '@neko/shared';
import type { IJournalWriter } from '../types';
import { ToolGroupRegistry } from '../../skill';
import { createTableHeavyStreamFixture } from '../../../../../test-utils/src/fixtures';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    watch: vi.fn(() => ({ close() {} })),
  };
});

// =============================================================================
// Helpers
// =============================================================================

async function collectEvents(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

function parseLatestWrite<T>(writes: readonly { path: string; data: string }[], path: string): T {
  const match = [...writes].reverse().find((write) => write.path === path);
  expect(match).toBeDefined();
  return JSON.parse(match!.data) as T;
}

function parseJsonlWrites<T>(writes: readonly { path: string; data: string }[], path: string): T[] {
  return writes
    .filter((write) => write.path === path)
    .flatMap((write) => write.data.split('\n'))
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

function conversationLogPath(conversationId: string, kind: 'events' | 'audits' | 'steps'): string {
  return `/tmp/proj/.neko/logs/conversations/${conversationId}/${kind}.jsonl`;
}

// =============================================================================
// Mocks
// =============================================================================

/** Mock steps yielded by AgentExecutor.executeStream */
function createMockExecutorModule(steps: AgentStep[]) {
  const hooks: ExecutorHooks[] = [];
  return {
    executeStream: vi.fn(async function* (input: string, context?: Partial<AgentContext>) {
      let agentContext: AgentContext = {
        messages: context?.messages ? [...context.messages] : [{ role: 'user', content: input }],
        state: context?.state ?? 'think',
        iteration: context?.iteration ?? 0,
        toolResults: context?.toolResults ? [...context.toolResults] : [],
        metadata: { ...(context?.metadata ?? {}) },
        ...(context?.trace ? { trace: context.trace } : {}),
        ...(context?.skipUserMessage !== undefined
          ? { skipUserMessage: context.skipUserMessage }
          : {}),
      };

      for (const hook of hooks) {
        await hook.onExecuteStart?.(input, agentContext);
      }
      agentContext.iteration += 1;
      for (const hook of hooks) {
        const nextContext = await hook.beforeThink?.(agentContext);
        if (nextContext) {
          agentContext = nextContext;
        }
      }
      for (const step of steps) {
        if (step.type === 'think') {
          for (const hook of hooks) {
            await hook.afterThink?.(step, agentContext);
          }
        }
        yield step;
      }
      for (const hook of hooks) {
        await hook.onIterationComplete?.(agentContext.iteration, agentContext);
      }
    }),
    execute: vi.fn(),
    abort: vi.fn(),
    getState: vi.fn().mockReturnValue('done'),
    addHook: vi.fn((hook: ExecutorHooks) => {
      hooks.push(hook);
    }),
    removeHook: vi.fn((name: string) => {
      const index = hooks.findIndex((hook) => hook.name === name);
      if (index < 0) return false;
      hooks.splice(index, 1);
      return true;
    }),
    getHook: vi.fn((name: string) => hooks.find((hook) => hook.name === name)),
    createCheckpoint: vi.fn(),
    setToolInjectionManager: vi.fn(),
    updateServiceOptions: vi.fn(),
  };
}

function createMockService(): IService {
  return {
    chat: vi.fn(),
    chatStream: vi.fn(),
    embed: vi.fn(),
  };
}

async function* responseToStream(resp: ServiceResponse): AsyncIterable<StreamChunk> {
  const content = typeof resp.message.content === 'string' ? resp.message.content : '';
  if (content) {
    yield { type: 'content', content };
  }
  if (resp.message.toolCalls) {
    for (const toolCall of resp.message.toolCalls) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: toolCall.id,
          type: toolCall.type,
          function: toolCall.function,
        },
      };
    }
  }
  yield {
    type: 'done',
    finishReason: resp.finishReason,
    usage: resp.usage,
  };
}

function textResponse(content: string): ServiceResponse {
  return {
    id: 'resp_text',
    model: 'test-model',
    message: { role: 'assistant', content } as ChatMessage,
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

function toolCallResponse(
  toolName: string,
  args: Record<string, unknown>,
  callId = 'call_1',
): ServiceResponse {
  return {
    id: 'resp_tool',
    model: 'test-model',
    message: {
      role: 'assistant',
      content: '',
      toolCalls: [
        {
          id: callId,
          type: 'function' as const,
          function: { name: toolName, arguments: JSON.stringify(args) },
        },
      ],
    } as ChatMessage,
    finishReason: 'tool_calls',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  };
}

function createMockToolRegistry(): IToolRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    has: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    listByCategory: vi.fn().mockReturnValue([]),
    execute: vi.fn(),
    toToolDefinitions: vi.fn().mockReturnValue([]),
  };
}

function createConfig(overrides?: Partial<AgentSessionConfig>): AgentSessionConfig {
  return {
    service: createMockService(),
    toolRegistry: createMockToolRegistry(),
    systemPrompt: 'You are a helpful assistant.',
    maxIterations: 10,
    validationCoordinatorFactory: createValidationCoordinatorFactory(),
    ...overrides,
  };
}

const qualityReviewResourceRef: ResourceRef = {
  id: 'asset:video:scene-2',
  scope: 'project',
  provider: 'project',
  kind: 'media',
  source: { kind: 'file', projectRelativePath: 'assets/scene-2.mp4' },
  fingerprint: { strategy: 'hash', value: 'sha256:scene-2-v1' },
};

function createSessionQualityGateResult(
  overrides: Partial<QualityGateResult> = {},
): QualityGateResult {
  return {
    version: MEDIA_QUALITY_CONTRACT_VERSION,
    gateResultId: 'gate-scene-2-v1',
    target: {
      version: MEDIA_QUALITY_CONTRACT_VERSION,
      targetId: 'scene-2',
      kind: 'video-clip',
      resourceRef: qualityReviewResourceRef,
      revision: 'rev-1',
      contentDigest: 'sha256:scene-2-v1',
    },
    policy: {
      policyId: 'video-production',
      policyVersion: '1',
      requiredProfiles: ['video-clip'],
    },
    verdict: 'fail',
    evidenceIds: ['technical-scene-2', 'perception-scene-2'],
    staleEvidenceIds: [],
    missingEvaluatorClasses: [],
    diagnostics: [
      {
        code: 'quality-evaluator-failed',
        severity: 'error',
        message: 'Frame drops exceeded the configured policy.',
      },
    ],
    repairPlan: {
      planId: 'repair-scene-2-v1',
      requiresNewRevision: true,
      actions: [
        {
          owner: 'video',
          targetId: 'scene-2',
          issueIds: ['frame-drop-1'],
          instruction: 'Regenerate the damaged clip.',
        },
      ],
    },
    createdAt: '2026-07-12T00:00:00.000Z',
    ...overrides,
  };
}

function createMockProjectMemory(initialContent: string | null = null): IProjectMemoryManager {
  let content = initialContent;
  const listeners: Array<(value: string | null) => void> = [];

  return {
    load: vi.fn().mockResolvedValue(undefined),
    getContent: vi.fn(() => content),
    upsertEntry: vi.fn(async (key: string, body: string) => {
      const sections = parseSections(content);
      const next = new Map(sections.map((section) => [section.key, section.body]));
      next.set(key, body);
      content = Array.from(next.entries())
        .map(([sectionKey, sectionBody]) =>
          sectionBody.trim().length > 0
            ? `## ${sectionKey}\n${sectionBody.trimEnd()}`
            : `## ${sectionKey}`,
        )
        .join('\n\n');
      if (content) {
        content += '\n';
      }
      for (const listener of listeners) {
        listener(content);
      }
    }),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((_event, listener) => {
      listeners.push(listener);
    }),
    off: vi.fn((_event, listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    }),
  };
}

function createMockJournalWriter(): IJournalWriter & {
  appendEvent: ReturnType<typeof vi.fn>;
  appendSnapshot: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    appendEvent: vi.fn(async (seq: number) => `evt-${seq}`),
    appendSnapshot: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

function parseSections(content: string | null): Array<{ key: string; body: string }> {
  if (!content) return [];

  const lines = content.split('\n');
  const sections: Array<{ key: string; body: string }> = [];
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentKey !== null) {
        sections.push({ key: currentKey, body: currentLines.join('\n') });
      }
      currentKey = line.slice(3).trim();
      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    sections.push({ key: currentKey, body: currentLines.join('\n') });
  }

  return sections;
}

// =============================================================================
// Mock AgentExecutor — we replace the internal _executor after construction
// =============================================================================

function injectMockExecutor(session: AgentSession, steps: AgentStep[]) {
  const mockExec = createMockExecutorModule(steps);
  // Access private _executor via bracket notation
  const internals = session as unknown as Record<string, unknown>;
  internals['_executor'] = mockExec;
  const runnerHooks = internals['_runnerHooks'];
  if (isExecutorHooks(runnerHooks)) {
    mockExec.addHook(runnerHooks);
  }
  const installRefreshHook = internals['_installSessionSystemPromptRefreshHook'];
  if (typeof installRefreshHook === 'function') {
    installRefreshHook.call(session);
  }
  const installReadImagePerceptionBackfillHook =
    internals['_installReadImagePerceptionBackfillHook'];
  if (typeof installReadImagePerceptionBackfillHook === 'function') {
    installReadImagePerceptionBackfillHook.call(session);
  }
  return mockExec;
}

function isExecutorHooks(value: unknown): value is ExecutorHooks {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'onExecuteStart' in value ||
    'beforeThink' in value ||
    'afterThink' in value ||
    'beforeAct' in value ||
    'afterAct' in value ||
    'onIterationComplete' in value
  );
}

// =============================================================================
// Tests
// =============================================================================

describe('AgentSession', () => {
  let config: AgentSessionConfig;

  beforeEach(() => {
    config = createConfig();
  });

  // -------------------------------------------------------------------------
  // 1. Constructor
  // -------------------------------------------------------------------------

  describe('constructor', () => {
    it('should initialize with system prompt in history', () => {
      const session = new AgentSession(config);
      const history = session.getHistory();

      expect(history.length).toBe(1);
      expect(history[0]!.role).toBe('system');
      expect(history[0]!.content).toBe('You are a helpful assistant.');
    });

    it('should default execution mode to auto', () => {
      const session = new AgentSession(config);
      expect(session.getExecutionMode()).toBe('auto');
    });

    it('exposes prompt composition metadata without hidden prompt bodies', () => {
      const hiddenBase = 'SYSTEM_SECRET sk-session-hidden /Users/private/workspace';
      const hiddenFragment = 'CAPABILITY_SECRET internal instructions';
      const session = new AgentSession(
        createConfig({
          systemPrompt: hiddenBase,
          promptFragments: [{ id: 'neko-test:secret-fragment', content: hiddenFragment }],
        }),
      );

      const projection = session.getPromptCompositionProjection();
      expect(projection).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'base', source: 'base' }),
          expect.objectContaining({
            id: 'fragment:neko-test:secret-fragment',
            source: 'subpackage.fragments',
          }),
        ]),
      );
      const serialized = JSON.stringify(projection);
      expect(serialized).not.toContain(hiddenBase);
      expect(serialized).not.toContain(hiddenFragment);
      expect(serialized).not.toContain('/Users/private');
      expect(projection.every((fragment, order) => fragment.order === order)).toBe(true);
    });

    it('registers configured perception evidence tools without default prompt injection', () => {
      const toolRegistry = createMockToolRegistry();
      new AgentSession(
        createConfig({
          toolRegistry,
          perceptionClients: {
            transcribe: {
              perception: {
                transcribe: vi.fn(),
              },
            },
            similarity: {
              perception: {
                similarity: vi.fn(),
              },
            },
            classify: {
              perception: {
                classify: vi.fn(),
              },
            },
          },
        }),
      );

      const registeredNames = vi
        .mocked(toolRegistry.register)
        .mock.calls.map(([tool]) => tool.name);
      expect(registeredNames).toEqual(
        expect.arrayContaining([
          TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT,
          TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
          TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY,
          TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY,
        ]),
      );
      expect(toolRegistry.toToolDefinitions).toHaveBeenCalled();
    });

    it('injects the aggregate perception tool when a perception pipeline is configured', () => {
      const toolRegistry = new ToolRegistry();
      const session = new AgentSession(
        createConfig({
          toolRegistry,
          perceptionPipeline: {
            perceive: vi.fn(),
          },
        }),
      );
      const toolInjectionManager = (session as unknown as Record<string, unknown>)[
        '_toolInjectionManager'
      ] as { getToolsForTurn(input: string): string[] };

      expect(toolRegistry.has(TOOL_NAMES_PERCEPTION.PERCEIVE)).toBe(true);
      expect(toolInjectionManager.getToolsForTurn('analyze generated image quality')).toContain(
        TOOL_NAMES_PERCEPTION.PERCEIVE,
      );
    });

    it('executes registered perception tools after the lazy ToolSet is available', async () => {
      const toolRegistry = new ToolRegistry();
      new AgentSession(
        createConfig({
          toolRegistry,
          perceptionClients: {
            transcribe: {
              perception: {
                transcribe: vi.fn(async () => ({
                  text: 'hello world',
                  segments: [],
                  language: 'en',
                  durationSecs: 1,
                })),
              },
            },
            similarity: {
              perception: {
                similarity: vi.fn(async () => 0.75),
              },
            },
            classify: {
              perception: {
                classify: vi.fn(async () => [{ label: 'red umbrella', score: 0.91 }]),
              },
            },
          },
        }),
      );

      expect(toolRegistry.has(TOOL_NAMES_PERCEPTION.DESCRIBE_INPUT)).toBe(true);
      expect(toolRegistry.has(TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE)).toBe(true);
      expect(toolRegistry.has(TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY)).toBe(true);
      expect(toolRegistry.has(TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY)).toBe(true);
      await expect(
        toolRegistry.execute(TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE, {
          audioSource: '/tmp/audio.wav',
          evidenceId: 'evidence-audio',
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 'evidence-audio',
            source: 'tool',
            summary: 'hello world',
            toolName: TOOL_NAMES_PERCEPTION.AUDIO_TRANSCRIBE,
          }),
        }),
      );
      await expect(
        toolRegistry.execute(TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY, {
          imageSource: '/tmp/frame.png',
          text: 'red umbrella',
          evidenceId: 'evidence-image',
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 'evidence-image',
            source: 'tool',
            confidence: 0.75,
            toolName: TOOL_NAMES_PERCEPTION.IMAGE_SIMILARITY,
          }),
        }),
      );
      await expect(
        toolRegistry.execute(TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY, {
          imageSource: '/tmp/frame.png',
          labels: ['red umbrella'],
          evidenceId: 'evidence-classify',
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            id: 'evidence-classify',
            source: 'tool',
            confidence: 0.91,
            toolName: TOOL_NAMES_PERCEPTION.IMAGE_CLASSIFY,
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 2. execute() — simple text response
  // -------------------------------------------------------------------------

  describe('execute() simple response', () => {
    it('should yield text + iteration + done events', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [{ type: 'think', content: 'Hello world', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      const events = await collectEvents(session.execute('Hi'));

      const textEvents = events.filter((e) => e.type === 'text');
      expect(textEvents.length).toBe(1);
      expect(textEvents[0]!.content).toBe('Hello world');

      const doneEvents = events.filter((e) => e.type === 'done');
      expect(doneEvents.length).toBe(1);
    });

    it('uses the turn ID as the isolated runtime run identity for ordinary chat turns', async () => {
      const session = new AgentSession(createConfig({ conversationId: 'conv-turn-trace' }));
      const steps: AgentStep[] = [{ type: 'think', content: 'Hello world', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);

      await collectEvents(session.execute('Hi'));

      const callArgs = mockExec.executeStream.mock.calls[0] as
        | [
            string,
            {
              metadata?: Record<string, unknown>;
              trace?: { conversationId?: string; turnId?: string; runId?: string };
            },
          ]
        | undefined;
      const options = callArgs?.[1];

      expect(options?.metadata).toEqual(
        expect.objectContaining({
          conversationId: 'conv-turn-trace',
          turnId: expect.stringMatching(/^turn-conv-turn-trace-/),
        }),
      );
      expect(options?.metadata?.runId).toBe(options?.metadata?.turnId);
      expect(options?.trace).toEqual(
        expect.objectContaining({
          conversationId: 'conv-turn-trace',
          turnId: expect.stringMatching(/^turn-conv-turn-trace-/),
          phase: 'session',
        }),
      );
      expect(options?.trace?.runId).toBe(options?.trace?.turnId);
    });

    it('does not leak an active durable workflow run into ordinary executor turn trace', async () => {
      const session = new AgentSession(
        createConfig({
          conversationId: 'conv-workflow-trace',
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: 'Hello world', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);

      await collectEvents(session.execute('Hi'));

      const callArgs = mockExec.executeStream.mock.calls[0] as
        | [
            string,
            {
              metadata?: Record<string, unknown>;
              trace?: { conversationId?: string; turnId?: string; runId?: string };
            },
          ]
        | undefined;
      const options = callArgs?.[1];

      expect(options?.metadata).toEqual(
        expect.objectContaining({
          conversationId: 'conv-workflow-trace',
          turnId: expect.stringMatching(/^turn-conv-workflow-trace-/),
        }),
      );
      expect(options?.metadata?.runId).toBe(options?.metadata?.turnId);
      expect(options?.trace).toEqual(
        expect.objectContaining({
          conversationId: 'conv-workflow-trace',
          turnId: expect.stringMatching(/^turn-conv-workflow-trace-/),
          phase: 'session',
        }),
      );
      expect(options?.trace?.runId).toBe(options?.trace?.turnId);
    });
  });

  // -------------------------------------------------------------------------
  // 3. execute() — with tool calls
  // -------------------------------------------------------------------------

  describe('execute() with tool calls', () => {
    it('should yield tool_call and tool_result events', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [
        {
          type: 'think',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: '/a.ts' } }],
          timestamp: Date.now(),
        },
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolResults: [
            {
              success: true,
              data: 'file content',
              callId: 'call_1',
              name: 'read_file',
            } as ToolResultWithMeta,
          ],
          timestamp: Date.now(),
        },
        {
          type: 'think',
          content: 'Here is the file content.',
          timestamp: Date.now(),
        },
      ];
      injectMockExecutor(session, steps);

      const events = await collectEvents(session.execute('Read a.ts'));

      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      expect(toolCallEvents.length).toBe(1);
      expect(toolCallEvents[0]!.toolCall!.name).toBe('read_file');

      const toolResultEvents = events.filter((e) => e.type === 'tool_result');
      expect(toolResultEvents.length).toBe(1);
      expect(toolResultEvents[0]!.toolResult!.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. execute() — user message added to history (not duplicated)
  // -------------------------------------------------------------------------

  describe('execute() user message in history', () => {
    it('should add user message to history and pass skipUserMessage', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [{ type: 'think', content: 'Response', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);

      await collectEvents(session.execute('Hello'));

      // User message should be in history
      const history = session.getHistory();
      const userMessages = history.filter((m) => m.role === 'user');
      expect(userMessages.length).toBe(1);
      expect(userMessages[0]!.content).toBe('Hello');

      // Executor should receive skipUserMessage: true
      const callArgs = mockExec.executeStream.mock.calls[0] as
        [string, { skipUserMessage?: boolean }] | undefined;
      expect(callArgs?.[1]?.skipUserMessage).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. execute() — rejects concurrent execution
  // -------------------------------------------------------------------------

  describe('execute() concurrent rejection', () => {
    it('should yield error when already running', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, []);

      // Simulate running state by setting _isRunning directly
      (session as unknown as Record<string, boolean>)['_isRunning'] = true;

      // Attempt execution while "running"
      const events = await collectEvents(session.execute('Second'));
      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBe(1);
      expect(errorEvents[0]!.error!.message).toContain('already running');
    });
  });

  describe('execute() failure lifecycle', () => {
    it('keeps session history consistent when execute() fails', async () => {
      const session = new AgentSession(
        createConfig({
          executionMode: 'plan',
        }),
      );
      const mockExec = injectMockExecutor(session, []);
      mockExec.executeStream.mockImplementationOnce(
        // eslint-disable-next-line require-yield
        async function* () {
          throw new Error('executor blew up');
        },
      );

      const events = await collectEvents(session.execute('Break the pipeline'));

      expect(events).toEqual([
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({ message: 'executor blew up' }),
        }),
      ]);
      expect(session.getHistory().at(-1)).toEqual({
        role: 'assistant',
        content: 'executor blew up',
      });
    });
  });

  describe('patchToolResult()', () => {
    it('patches in-memory tool history and appends a journal backfill event', async () => {
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(createConfig({ journalWriter }));
      session.loadHistory([
        {
          role: 'tool',
          toolCallId: 'call-1',
          content: JSON.stringify({ status: 'queued', taskId: 'task-1' }),
        },
      ]);

      const result = await session.patchToolResult({
        toolCallId: 'call-1',
        timestamp: 1,
        dataPatch: {
          status: 'completed',
          thumbnailAssetRef: {
            assetId: 'asset-1',
            uri: '${WORKSPACE}/thumb.png',
            mimeType: 'image/png',
          },
        },
        perceptionCards: [
          {
            version: 1,
            assetId: 'asset-1',
            modality: 'image',
            createdAt: 1,
            layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'skipped' },
            structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
          },
        ],
      });

      expect(result).toEqual({ patched: true, eventId: 'evt-1' });
      expect(journalWriter.appendEvent).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ type: 'tool_result_backfill' }),
      );
      expect(journalWriter.flush).toHaveBeenCalled();
      const toolMessage = session
        .getHistory()
        .find((message) => message.role === 'tool' && message.toolCallId === 'call-1');
      expect(JSON.parse(toolMessage!.content as string)).toEqual(
        expect.objectContaining({
          schema: 'neko.tool-result.v1',
          data: expect.objectContaining({
            status: 'completed',
            taskId: 'task-1',
          }),
          perceptionCards: [expect.objectContaining({ assetId: 'asset-1' })],
        }),
      );
    });
  });

  describe('ReadImage perception backfill', () => {
    it('installs the ReadImage perception backfill hook without stage tracking', () => {
      const session = new AgentSession(createConfig());
      const mockExec = injectMockExecutor(session, []);

      expect(mockExec.getHook('session-read-image-perception-backfill')?.afterAct).toBeDefined();
    });

    it('adds configured image understanding evidence before tool results are observed', async () => {
      const perceptionPipeline = {
        perceive: vi.fn(async () => ({
          card: {
            version: 1 as const,
            assetId: 'read-image-res-1',
            modality: 'image' as const,
            createdAt: 2,
            layerStatus: {
              layer0: 'complete' as const,
              layer1: 'complete' as const,
              layer2: 'skipped' as const,
            },
            structural: {
              format: 'png',
              mimeType: 'image/png',
              byteSize: 10,
              width: 64,
              height: 64,
            },
            semantic: {
              evidences: [
                { kind: 'custom' as const, confidence: 0.9, value: { summary: 'A playful cat.' } },
              ],
            },
          },
        })),
      };
      const results: ToolResultWithMeta[] = [
        {
          callId: 'call-read-image',
          name: 'ReadImage',
          success: true,
          data: { mode: 'metadata' },
          perceptionCards: [
            {
              version: 1,
              assetId: 'read-image-res-1',
              modality: 'image',
              createdAt: 1,
              layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
              structural: {
                format: 'png',
                mimeType: 'image/png',
                byteSize: 10,
                width: 64,
                height: 64,
              },
              perceptual: {
                thumbnailRef: {
                  assetId: 'read-image-res-1',
                  uri: '${WORKSPACE}/image.png',
                  mimeType: 'image/png',
                },
              },
            },
          ],
        },
      ];

      await backfillReadImagePerceptionResults({
        results,
        perceptionPipeline,
        chatModel: { providerId: 'deepseek-chat', modelId: 'deepseek-v4-flash' },
        metadata: {
          understandingModels: {
            image: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5', category: 'llm' },
          },
        },
      });

      expect(perceptionPipeline.perceive).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: {
            assetId: 'read-image-res-1',
            ref: expect.objectContaining({ assetId: 'read-image-res-1' }),
          },
          sourceToolCallId: 'call-read-image',
          focus: 'visual',
          understandingModels: {
            image: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
          },
          policy: expect.objectContaining({ layers: [0, 1] }),
        }),
      );
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.perceptionCards).toEqual([
        expect.objectContaining({ layerStatus: expect.objectContaining({ layer1: 'skipped' }) }),
        expect.objectContaining({ layerStatus: expect.objectContaining({ layer1: 'complete' }) }),
      ]);
    });

    it('derives image perception targets from ReadImage metadata-only results', async () => {
      const perceptionPipeline = {
        perceive: vi.fn(async () => ({
          card: {
            version: 1 as const,
            assetId: 'generated-asset-1',
            modality: 'image' as const,
            createdAt: 2,
            layerStatus: {
              layer0: 'complete' as const,
              layer1: 'complete' as const,
              layer2: 'skipped' as const,
            },
            structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
            semantic: {
              evidences: [
                {
                  kind: 'custom' as const,
                  confidence: 0.9,
                  value: { summary: 'A generated cat image.' },
                },
              ],
            },
          },
        })),
      };
      const results: ToolResultWithMeta[] = [
        {
          callId: 'call-read-image',
          name: 'ReadImage',
          success: true,
          data: {
            mode: 'metadata',
            images: [
              {
                label: 'generated-assets/cat.png',
                mimeType: 'image/png',
                resourceRef: {
                  id: 'res-1',
                  source: { kind: 'generated-asset', filePath: '/tmp/cat.png' },
                  locator: { kind: 'generated-asset', assetId: 'generated-asset-1' },
                },
              },
            ],
          },
        },
      ];

      await backfillReadImagePerceptionResults({
        results,
        perceptionPipeline,
        chatModel: { providerId: 'deepseek-chat', modelId: 'deepseek-v4-flash' },
        metadata: {
          understandingModels: {
            image: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
          },
        },
      });

      expect(perceptionPipeline.perceive).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: {
            assetId: 'generated-asset-1',
            ref: expect.objectContaining({
              assetId: 'generated-asset-1',
              uri: '/tmp/cat.png',
              mimeType: 'image/png',
              resourceRef: expect.objectContaining({ id: 'res-1' }),
            }),
          },
          sourceToolCallId: 'call-read-image',
        }),
      );
      expect(results[0]!.perceptionCards).toEqual([
        expect.objectContaining({ assetId: 'generated-asset-1' }),
      ]);
    });

    it('skips ReadImage perception backfill when no different perception model is configured', async () => {
      const perceptionPipeline = {
        perceive: vi.fn(async () => ({
          card: {
            version: 1 as const,
            assetId: 'generated-asset-1',
            modality: 'image' as const,
            createdAt: 2,
            layerStatus: {
              layer0: 'complete' as const,
              layer1: 'complete' as const,
              layer2: 'skipped' as const,
            },
            structural: { format: 'png', mimeType: 'image/png', byteSize: 10 },
          },
        })),
      };
      const results: ToolResultWithMeta[] = [
        {
          callId: 'call-read-image',
          name: 'ReadImage',
          success: true,
          data: {
            images: [
              {
                mimeType: 'image/png',
                resourceRef: {
                  id: 'res-1',
                  source: { kind: 'generated-asset', filePath: '/tmp/cat.png' },
                  locator: { kind: 'generated-asset', assetId: 'generated-asset-1' },
                },
              },
            ],
          },
        },
      ];

      await backfillReadImagePerceptionResults({ results, perceptionPipeline });

      expect(perceptionPipeline.perceive).not.toHaveBeenCalled();
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.perceptionCards).toBeUndefined();
    });

    it('skips ReadImage perception backfill when chat and perception models match', async () => {
      const perceptionPipeline = {
        perceive: vi.fn(async () => ({ card: {} })),
      };
      const results: ToolResultWithMeta[] = [
        {
          callId: 'call-read-image',
          name: 'ReadImage',
          success: true,
          data: {
            images: [
              {
                mimeType: 'image/png',
                resourceRef: {
                  id: 'res-1',
                  source: { kind: 'generated-asset', filePath: '/tmp/cat.png' },
                  locator: { kind: 'generated-asset', assetId: 'generated-asset-1' },
                },
              },
            ],
          },
        },
      ];

      await backfillReadImagePerceptionResults({
        results,
        perceptionPipeline,
        chatModel: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
        metadata: {
          understandingModels: {
            image: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
          },
        },
      });

      expect(perceptionPipeline.perceive).not.toHaveBeenCalled();
      expect(results[0]!.success).toBe(true);
      expect(results[0]!.perceptionCards).toBeUndefined();
    });

    it('keeps ReadImage successful when perception backfill fails', async () => {
      const perceptionPipeline = {
        perceive: vi.fn(async () => {
          throw new Error('No content access provider supports this request.');
        }),
      };
      const results: ToolResultWithMeta[] = [
        {
          callId: 'call-read-image',
          name: 'ReadImage',
          success: true,
          data: {
            images: [
              {
                mimeType: 'image/png',
                resourceRef: {
                  id: 'res-1',
                  source: { kind: 'generated-asset', filePath: '/tmp/cat.png' },
                  locator: { kind: 'generated-asset', assetId: 'generated-asset-1' },
                },
              },
            ],
          },
        },
      ];

      await backfillReadImagePerceptionResults({
        results,
        perceptionPipeline,
        chatModel: { providerId: 'deepseek-chat', modelId: 'deepseek-v4-flash' },
        metadata: {
          understandingModels: {
            image: { providerId: 'nekoapi-chat', modelId: 'gpt-5.5' },
          },
        },
      });

      expect(results[0]!.success).toBe(true);
      expect(results[0]!.error).toBeUndefined();
      expect(results[0]!.backfillDiagnostics).toEqual([
        expect.objectContaining({
          path: 'call-read-image',
          incoming: expect.objectContaining({
            error: 'No content access provider supports this request.',
          }),
        }),
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // 6. execute() — plan mode injects reminder
  // -------------------------------------------------------------------------

  describe('execute() plan mode', () => {
    it('should prepend PLAN_MODE_SYSTEM_REMINDER to input', async () => {
      const session = new AgentSession(createConfig({ executionMode: 'plan' }));
      const steps: AgentStep[] = [
        { type: 'think', content: 'Plan response', timestamp: Date.now() },
      ];
      const mockExec = injectMockExecutor(session, steps);

      await collectEvents(session.execute('Build a feature'));

      const callArgs = mockExec.executeStream.mock.calls[0] as [string] | undefined;
      const inputArg = callArgs?.[0] ?? '';
      expect(inputArg).toContain(PLAN_MODE_SYSTEM_REMINDER);
      expect(inputArg).toContain('Build a feature');
    });
  });

  describe('project memory integration', () => {
    it('writes extracted facts to project memory and logs memory_extraction', async () => {
      const projectMemory = createMockProjectMemory();
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
          journalWriter,
        }),
      );
      const steps: AgentStep[] = [
        { type: 'think', content: '我会按你的偏好继续处理。', timestamp: Date.now() },
      ];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('我喜欢中文说明，避免 global-memory'));

      expect(projectMemory.upsertEntry).toHaveBeenCalledWith(
        'User Preferences',
        expect.stringContaining('我喜欢中文说明，避免 global-memory'),
      );
      expect(journalWriter.appendEvent).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          type: 'memory_extraction',
          memoryExtraction: expect.objectContaining({
            timestamp: expect.any(Number),
            writeStatus: 'written',
            sourceEventIds: expect.arrayContaining(['evt-1']),
          }),
        }),
      );
      expect(session.getValidationCycles()).toEqual([
        expect.objectContaining({
          signals: [
            expect.objectContaining({
              kind: 'memory-extraction',
            }),
          ],
          decisions: [
            {
              action: 'memorize',
              signalKind: 'memory-extraction',
              factCount: 1,
              writeStatus: 'written',
            },
          ],
          actions: [
            {
              kind: 'clear-guidance',
              reason: 'memorize',
            },
          ],
        }),
      ]);
    });

    it('does not extract project memory when autoMemoryExtraction is disabled', async () => {
      const projectMemory = createMockProjectMemory();
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
          autoMemoryExtraction: false,
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: '好的', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('我喜欢中文说明'));

      expect(projectMemory.upsertEntry).not.toHaveBeenCalled();
    });

    it('injects recalled project memories into the execution snapshot', async () => {
      const projectMemory = createMockProjectMemory(
        '## User Preferences\n- prefer dark theme for editor work\n',
      );
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: 'Noted', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);
      let capturedSystemPrompt = '';
      mockExec.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        capturedSystemPrompt = String(options?.messages?.[0]?.content ?? '');
        for (const step of steps) {
          yield step;
        }
      });

      await collectEvents(session.execute('please keep dark theme settings'));

      expect(capturedSystemPrompt).toContain('## Recalled Memories');
      expect(capturedSystemPrompt).toContain('dark theme');
    });

    it('does not inject recalled memories when memoryRecall is disabled', async () => {
      const projectMemory = createMockProjectMemory(
        '## User Preferences\n- prefer dark theme for editor work\n',
      );
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
          memoryRecall: false,
        }),
      );
      const steps: AgentStep[] = [{ type: 'think', content: 'Noted', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);
      let capturedSystemPrompt = '';
      mockExec.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        capturedSystemPrompt = String(options?.messages?.[0]?.content ?? '');
        for (const step of steps) {
          yield step;
        }
      });

      await collectEvents(session.execute('please keep dark theme settings'));

      expect(capturedSystemPrompt).not.toContain('## Recalled Memories');
      expect(capturedSystemPrompt).toContain('## Project Memory');
    });

    it('keeps runtime prompt modules in Chinese when the session locale is zh', async () => {
      const projectMemory = createMockProjectMemory(
        '## User Preferences\n- Tool result: docs updated\n',
      );
      const session = new AgentSession(
        createConfig({
          systemPrompt: '## 项目背景\n中文基础提示词',
          locale: 'zh',
          projectMemoryManager: projectMemory,
          memoryRecall: false,
          promptFragments: [
            {
              id: 'neko-canvas:rendering-guide',
              content: '## Canvas Rendering Guide\nUse English fallback.',
              locales: {
                zh: { content: '## 画布渲染指南\n使用中文提示词。' },
              },
            },
          ],
        }),
      );
      const scriptSkill = getScriptGenerationSkill('zh-CN');
      session.applySkillInjection(
        {
          name: scriptSkill.name,
          systemPrompt: scriptSkill.content,
          allowedTools: scriptSkill.allowedTools ? [...scriptSkill.allowedTools] : undefined,
          type: 'skill',
        },
        scriptSkill,
      );
      const steps: AgentStep[] = [{ type: 'think', content: '好的', timestamp: Date.now() }];
      const mockExec = injectMockExecutor(session, steps);
      let capturedSystemPrompt = '';
      let capturedModelSectionsPrompt = '';
      mockExec.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const serviceOptions = mockExec.updateServiceOptions.mock.calls.at(-1)?.[0] as
          { systemPromptSections?: Array<{ content: string }> } | undefined;
        capturedModelSectionsPrompt =
          serviceOptions?.systemPromptSections?.map((section) => section.content).join('\n\n') ??
          '';
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        capturedSystemPrompt = String(options?.messages?.[0]?.content ?? '');
        for (const step of steps) {
          yield step;
        }
      });

      await collectEvents(session.execute('请继续'));

      expect(capturedSystemPrompt).toContain('## 项目记忆');
      expect(capturedSystemPrompt).toContain('## 用户偏好');
      expect(capturedSystemPrompt).toContain('- 工具结果: docs updated');
      expect(capturedSystemPrompt).toContain('## 画布渲染指南');
      expect(capturedSystemPrompt).toContain('Fountain 语法');
      expect(capturedSystemPrompt).not.toContain('## Creation document contract');
      expect(capturedSystemPrompt).not.toContain('## Project Memory');
      expect(capturedSystemPrompt).not.toContain('## User Preferences');
      expect(capturedSystemPrompt).not.toContain('## Canvas Rendering Guide');
      expect(capturedSystemPrompt).not.toContain('Fountain Syntax Reference');
      expect(capturedSystemPrompt).not.toContain('Tool result:');
      expect(capturedModelSectionsPrompt).toContain('## 项目记忆');
      expect(capturedModelSectionsPrompt).toContain('## 用户偏好');
      expect(capturedModelSectionsPrompt).toContain('- 工具结果: docs updated');
      expect(capturedModelSectionsPrompt).toContain('## 画布渲染指南');
      expect(capturedModelSectionsPrompt).toContain('Fountain 语法');
      expect(capturedModelSectionsPrompt).not.toContain('## Creation document contract');
      expect(capturedModelSectionsPrompt).not.toContain('## Project Memory');
      expect(capturedModelSectionsPrompt).not.toContain('## User Preferences');
      expect(capturedModelSectionsPrompt).not.toContain('## Canvas Rendering Guide');
      expect(capturedModelSectionsPrompt).not.toContain('Fountain Syntax Reference');
      expect(capturedModelSectionsPrompt).not.toContain('Tool result:');
    });

    it('sends the localized Chinese prompt to the final model service call', async () => {
      const service = createMockService();
      const projectMemory = createMockProjectMemory(
        '## User Preferences\n- Tool result: docs updated\n',
      );
      let capturedMessages: readonly ChatMessage[] = [];
      let capturedOptions: ServiceOptions = {};
      vi.mocked(service.chatStream).mockImplementation(async function* (messages, options) {
        capturedMessages = messages;
        capturedOptions = options ?? {};
        yield { type: 'content', content: '好的' };
        yield {
          type: 'done',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      });

      const session = new AgentSession(
        createConfig({
          service,
          systemPrompt: '## 项目背景\n中文基础提示词',
          locale: 'zh',
          projectMemoryManager: projectMemory,
          memoryRecall: false,
        }),
      );
      const executionSkill = getScriptGenerationSkill('zh-CN');
      session.applySkillInjection(
        {
          name: executionSkill.name,
          systemPrompt: executionSkill.content,
          allowedTools: executionSkill.allowedTools ? [...executionSkill.allowedTools] : undefined,
          type: 'skill',
        },
        executionSkill,
      );

      await collectEvents(session.execute('请继续生成中文分镜表'));

      const modelSystemPrompt = String(capturedMessages[0]?.content ?? '');
      const modelSectionsPrompt =
        capturedOptions.systemPromptSections?.map((section) => section.content).join('\n\n') ?? '';
      const finalModelPrompt = `${modelSystemPrompt}\n\n${modelSectionsPrompt}`;
      expect(modelSystemPrompt).toContain('## 项目记忆');
      expect(modelSystemPrompt).toContain('## 用户偏好');
      expect(modelSystemPrompt).toContain('专业剧本生成助手');
      expect(modelSystemPrompt).not.toContain('## Project Memory');
      expect(modelSystemPrompt).not.toContain('## User Preferences');
      expect(modelSystemPrompt).not.toContain('Professional Script Generation Assistant');
      expect(finalModelPrompt).not.toContain('## 创作文档契约');
      expect(finalModelPrompt).not.toContain('## Creation document contract');
      expect(modelSectionsPrompt).not.toContain('## 创作文档契约');
      expect(modelSectionsPrompt).toContain('## 项目记忆');
      expect(modelSectionsPrompt).toContain('专业剧本生成助手');
      expect(modelSectionsPrompt).not.toContain('## Creation document contract');
      expect(modelSectionsPrompt).not.toContain('## Project Memory');
      expect(modelSectionsPrompt).not.toContain('System Operator');
    });

    it('sends localized TS-inline builtin skill prompts to the final model service call', async () => {
      const service = createMockService();
      let capturedMessages: readonly ChatMessage[] = [];
      let capturedOptions: ServiceOptions = {};
      vi.mocked(service.chatStream).mockImplementation(async function* (messages, options) {
        capturedMessages = messages;
        capturedOptions = options ?? {};
        yield { type: 'content', content: '好的' };
        yield {
          type: 'done',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      });

      const session = new AgentSession(
        createConfig({
          service,
          systemPrompt: '## 项目背景\n中文基础提示词',
          locale: 'zh',
          memoryRecall: false,
        }),
      );
      const videoEditingSkill = getBuiltinSkills({ locale: 'zh-CN' }).find(
        (skill) => skill.name === 'video-editing',
      );
      expect(videoEditingSkill).toBeDefined();
      session.applySkillInjection(
        {
          name: videoEditingSkill!.name,
          systemPrompt: videoEditingSkill!.content,
          allowedTools: videoEditingSkill!.allowedTools
            ? [...videoEditingSkill!.allowedTools]
            : undefined,
          type: 'skill',
        },
        videoEditingSkill!,
      );

      await collectEvents(session.execute('请裁掉开头两秒并加转场'));

      const modelSystemPrompt = String(capturedMessages[0]?.content ?? '');
      const modelSectionsPrompt =
        capturedOptions.systemPromptSections?.map((section) => section.content).join('\n\n') ?? '';
      const finalModelPrompt = `${modelSystemPrompt}\n\n${modelSectionsPrompt}`;

      expect(finalModelPrompt).toContain('视频剪辑助手');
      expect(finalModelPrompt).toContain('时间线');
      expect(finalModelPrompt).not.toContain('Video Editing Assistant');
      expect(finalModelPrompt).not.toContain('You are an expert video editor');
    });

    it('sends localized tool schemas to the final model service call', async () => {
      const service = createMockService();
      const toolRegistry = new ToolRegistry();
      const toolGroupRegistry = new ToolGroupRegistry();
      toolRegistry.register(
        createTool({
          name: 'GenerateStoryboardFrame',
          description: 'Create an image generation task.',
          localization: {
            zh: {
              description: '创建图像生成任务。',
              parameters: {
                prompt: '图像生成或编辑提示词。',
              },
            },
          },
          parameters: {
            type: 'object',
            properties: {
              prompt: {
                type: 'string',
                description: 'Image generation or editing prompt.',
              },
            },
            required: ['prompt'],
          },
          category: 'media',
          execute: vi.fn(async () => ({ success: true, data: {} })),
        }),
      );
      toolGroupRegistry.register({
        name: 'storyboard-frame-tools',
        description: 'Storyboard frame media generation tools.',
        tools: ['GenerateStoryboardFrame'],
        source: 'builtin',
        enabled: true,
        loadingTier: 'resident',
      });
      let capturedOptions: ServiceOptions = {};
      vi.mocked(service.chatStream).mockImplementation(async function* (_messages, options) {
        capturedOptions = options ?? {};
        yield { type: 'content', content: '好的' };
        yield {
          type: 'done',
          finishReason: 'stop',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      });

      const session = new AgentSession(
        createConfig({
          service,
          toolRegistry,
          toolGroupRegistry,
          systemPrompt: '## 项目背景\n中文基础提示词',
          locale: 'zh',
          memoryRecall: false,
        }),
      );

      await collectEvents(session.execute('请生成分镜图像提示词'));

      const tool = capturedOptions.tools?.find(
        (definition) => definition.function.name === 'GenerateStoryboardFrame',
      )?.function;
      const parameters = tool?.parameters as
        { properties?: Record<string, { description?: string }> } | undefined;
      expect(tool?.description).toBe('创建图像生成任务。');
      expect(parameters?.properties?.prompt?.description).toBe('图像生成或编辑提示词。');
      expect(tool?.description).not.toContain('Create an image');
      expect(parameters?.properties?.prompt?.description).not.toContain('Image generation');
    });

    it('does not backfill loaded history into project memory on the next turn', async () => {
      const projectMemory = createMockProjectMemory();
      const session = new AgentSession(
        createConfig({
          projectMemoryManager: projectMemory,
        }),
      );
      session.loadHistory(
        [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: '我喜欢中文说明' },
          { role: 'assistant', content: '收到' },
        ],
        [[], ['evt-old-user'], ['evt-old-assistant']],
      );

      const steps: AgentStep[] = [{ type: 'think', content: '继续处理', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('继续'));

      expect(projectMemory.upsertEntry).not.toHaveBeenCalled();
    });
  });

  describe('compaction logging', () => {
    it('skips journal compaction events when compactLogging is disabled', async () => {
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(
        createConfig({
          journalWriter,
          compactLogging: false,
        }),
      );

      (session as unknown as Record<string, unknown>)['_history'] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'old user message' },
        { role: 'assistant', content: 'old assistant reply' },
      ] satisfies ChatMessage[];
      (session as unknown as Record<string, unknown>)['_historyEventIds'] = [
        [],
        ['evt-user'],
        ['evt-assistant'],
      ];
      (session as unknown as Record<string, unknown>)['_compressor'] = {
        compress: vi.fn().mockResolvedValue({
          messages: [
            {
              message: { role: 'system', content: 'You are a helpful assistant.' },
              sourceIndexes: [0],
              isSummary: false,
              compressedTokens: 5,
            },
            {
              message: { role: 'system', content: 'summary' },
              sourceIndexes: [1, 2],
              isSummary: true,
              compressedTokens: 5,
            },
          ],
          originalTokens: 100,
          compressedTokens: 20,
          compressionRatio: 0.2,
          messagesRemoved: 2,
          summariesCreated: 1,
          timestamp: Date.now(),
        }),
        estimateTokens: vi.fn().mockReturnValue(20),
      };

      await session.compressContext();

      expect(journalWriter.appendEvent).not.toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ type: 'compaction' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 7. cancel()
  // -------------------------------------------------------------------------

  describe('cancel()', () => {
    it('should call executor abort', () => {
      const session = new AgentSession(config);
      const mockExec = injectMockExecutor(session, []);

      session.cancel();

      expect(mockExec.abort).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 8. clearHistory()
  // -------------------------------------------------------------------------

  describe('clearHistory()', () => {
    it('should preserve system prompt after clearing', async () => {
      const session = new AgentSession(config);
      const steps: AgentStep[] = [{ type: 'think', content: 'Hi', timestamp: Date.now() }];
      injectMockExecutor(session, steps);

      await collectEvents(session.execute('Hello'));
      expect(session.getHistory().length).toBeGreaterThan(1);

      session.clearHistory();

      const history = session.getHistory();
      expect(history.length).toBe(1);
      expect(history[0]!.role).toBe('system');
      expect(history[0]!.content).toBe('You are a helpful assistant.');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Skill injection — permission rule lifecycle
  // -------------------------------------------------------------------------

  describe('skill injection permission rule cleanup', () => {
    it('should add allow rules on applySkillInjection and remove on removeSkillInjection', () => {
      const session = new AgentSession(config);

      // Access internal _permissionHooks
      const permHooks = (session as unknown as Record<string, unknown>)['_permissionHooks'] as
        | { addAllowRule: ReturnType<typeof vi.fn>; removeAllowRule: ReturnType<typeof vi.fn> }
        | undefined;

      // If permissionHooks exist, spy on them
      if (permHooks) {
        const addSpy = vi.spyOn(permHooks, 'addAllowRule');
        const removeSpy = vi.spyOn(permHooks, 'removeAllowRule');

        session.applySkillInjection({
          name: 'test-skill',
          systemPrompt: 'Test prompt',
          allowedTools: ['Read', 'Bash(git:*)'],
          type: 'skill',
        });

        expect(addSpy).toHaveBeenCalledWith('Read');
        expect(addSpy).not.toHaveBeenCalledWith('Bash(git:*)');

        session.removeSkillInjection('test-skill');

        expect(removeSpy).toHaveBeenCalledWith('Read');
        expect(removeSpy).not.toHaveBeenCalledWith('Bash(git:*)');
      }
    });

    it('keeps lifecycle ToolGuard restricted when persistent shell allow rules are filtered', () => {
      const session = new AgentSession(config);
      const permHooks = (session as unknown as Record<string, unknown>)['_permissionHooks'] as
        { addAllowRule: ReturnType<typeof vi.fn> } | undefined;
      if (!permHooks) {
        throw new Error('permission hooks missing');
      }
      const addSpy = vi.spyOn(permHooks, 'addAllowRule');
      const projection: SkillLifecycleProjection = {
        promptSections: [],
        toolPolicy: {
          mode: 'restricted',
          allowedTools: ['Bash(git:*)'],
          contributingRecordIds: ['record-1'],
          diagnostics: [],
        },
        diagnostics: [],
        visibleIndicators: [],
      };

      session.applySkillLifecycleProjection(projection);

      expect(addSpy).not.toHaveBeenCalledWith('Bash(git:*)');
      expect(session.isToolAllowed('Read')).toBe(false);
      expect(session.isToolAllowed('Bash')).toBe(false);
    });

    it('keeps Meta Tool Skill providers isolated across sessions sharing one Host registry', async () => {
      const toolRegistry = new ToolRegistry();
      const serviceA = createMockService();
      const serviceB = createMockService();
      const sessionA = new AgentSession(
        createConfig({
          service: serviceA,
          toolRegistry,
          conversationId: 'conversation-a',
          maxIterations: 2,
        }),
      );
      const sessionB = new AgentSession(
        createConfig({
          service: serviceB,
          toolRegistry,
          conversationId: 'conversation-b',
          maxIterations: 2,
        }),
      );
      const activateSkillA = vi.fn(async () => ({ success: true as const, skillName: 'image' }));
      const activateSkillB = vi.fn(async () => ({ success: true as const, skillName: 'image' }));
      const createProvider = (activateSkill: typeof activateSkillA) => ({
        listSkills: vi.fn(() => [{ name: 'image', description: 'Generate images.' }]),
        getActiveSkill: vi.fn(() => null),
        activateSkill,
        deactivateSkill: vi.fn(),
      });
      sessionA.setSkillProvider(createProvider(activateSkillA));
      sessionB.setSkillProvider(createProvider(activateSkillB));

      const permissionHooksB = (sessionB as unknown as Record<string, unknown>)[
        '_permissionHooks'
      ] as { addAllowRule: (tool: string) => void } | undefined;
      permissionHooksB?.addAllowRule('ActivateSkill');
      let callCount = 0;
      vi.mocked(serviceB.chatStream).mockImplementation(async function* () {
        callCount += 1;
        if (callCount === 1) {
          yield* responseToStream(
            toolCallResponse('ActivateSkill', {
              skillName: 'image',
              reason: 'The current conversation needs image generation.',
            }),
          );
          return;
        }
        yield* responseToStream(textResponse('Image Skill active.'));
      });

      await collectEvents(sessionB.execute('Generate an image.'));

      expect(activateSkillA).not.toHaveBeenCalled();
      expect(activateSkillB).toHaveBeenCalledOnce();
      sessionA.dispose();
      sessionB.dispose();
    });

    it('refreshes executor context with a lifecycle skill prompt activated during the same turn', async () => {
      const service = createMockService();
      const toolRegistry = new ToolRegistry();
      const session = new AgentSession(
        createConfig({
          service,
          toolRegistry,
          conversationId: 'conversation-skill-refresh',
          systemPrompt: 'Base prompt.',
          maxIterations: 3,
        }),
      );
      const permHooks = (session as unknown as Record<string, unknown>)['_permissionHooks'] as
        { addAllowRule: (tool: string) => void } | undefined;
      permHooks?.addAllowRule('ActivateSkill');
      const skillPrompt =
        'Comic storyboard skill: use scene, shot, source, imagePrompt, videoPrompt, duration, dialogue.';
      const activateSkill = vi.fn(async () => {
        session.applySkillLifecycleProjection({
          promptSections: [
            {
              id: 'skill:storyboard',
              layer: 'skill',
              content: skillPrompt,
              priority: 100,
              recordId: 'record-comic',
              slot: 'domainSkill',
              skillName: 'storyboard',
            },
          ],
          toolPolicy: {
            mode: 'unrestricted',
            contributingRecordIds: ['record-comic'],
            diagnostics: [],
          },
          diagnostics: [],
          visibleIndicators: [
            {
              id: 'record-comic',
              skillName: 'storyboard',
              slot: 'domainSkill',
              owner: 'agent',
              clearable: true,
              status: 'active',
            },
          ],
        });
        return {
          success: true,
          skillName: 'storyboard',
          lifecycleRecordId: 'record-comic',
        };
      });
      session.setSkillProvider({
        listSkills: vi.fn(() => [
          {
            name: 'storyboard',
            description: 'Create storyboard creative tables.',
          },
        ]),
        getActiveSkill: vi.fn(() => null),
        activateSkill,
        deactivateSkill: vi.fn(),
      });

      const capturedSystemPrompts: string[] = [];
      const capturedSkillNameEnums: unknown[] = [];
      vi.mocked(service.chatStream).mockImplementation(async function* (messages, options) {
        const systemMessage = messages.find((message) => message.role === 'system');
        capturedSystemPrompts.push(
          typeof systemMessage?.content === 'string' ? systemMessage.content : '',
        );
        const activateSkillDefinition = options?.tools?.find(
          (tool) => tool.function.name === 'ActivateSkill',
        );
        capturedSkillNameEnums.push(
          activateSkillDefinition?.function.parameters.properties?.['skillName']?.enum,
        );
        if (capturedSystemPrompts.length === 1) {
          yield* responseToStream(
            toolCallResponse('ActivateSkill', {
              skillName: 'storyboard',
              reason: 'The user requested a comic storyboard creative table.',
            }),
          );
          return;
        }
        yield* responseToStream(
          textResponse(
            '| scene | shot | source | imagePrompt | videoPrompt | duration | dialogue |\n' +
              '| --- | --- | --- | --- | --- | --- | --- |\n' +
              '| 开场 | 1 | P1 |  | 场景视频生成：... | 3s |  |',
          ),
        );
      });

      await collectEvents(session.execute('分析前 10 页并生成分镜表'));

      expect(activateSkill).toHaveBeenCalledOnce();
      expect(capturedSystemPrompts).toHaveLength(2);
      expect(capturedSystemPrompts[0]).toContain('# Available Skills');
      expect(capturedSystemPrompts[0]).toContain('**storyboard**');
      expect(capturedSystemPrompts[0]).not.toContain('comic-to-storyboard');
      expect(capturedSkillNameEnums[0]).toEqual(['storyboard']);
      expect(capturedSystemPrompts[0]).not.toContain('imagePrompt, videoPrompt');
      expect(capturedSystemPrompts[1]).toContain(skillPrompt);
    });

    it('registers CreateSkill and delegates creation without activating lifecycle state', async () => {
      const service = createMockService();
      const toolRegistry = new ToolRegistry();
      const session = new AgentSession(
        createConfig({
          service,
          toolRegistry,
          conversationId: 'conversation-skill-creation',
          systemPrompt: 'Base prompt.',
          maxIterations: 3,
        }),
      );
      const permHooks = (session as unknown as Record<string, unknown>)['_permissionHooks'] as
        { addAllowRule: (tool: string) => void } | undefined;
      permHooks?.addAllowRule('CreateSkill');
      const createSkill = vi.fn(async () => ({
        source: 'project' as const,
        rootId: 'project-agent-skills',
        relativePath: 'story-review',
        absolutePath: '/workspace/.agents/skills/story-review',
        fingerprint: 'sha256:story-review',
        diagnostics: [],
      }));
      const activateSkill = vi.fn();
      const deactivateSkill = vi.fn();
      session.setSkillProvider({
        listSkills: vi.fn(() => []),
        getActiveSkill: vi.fn(() => null),
        activateSkill,
        deactivateSkill,
        createSkill,
      });

      const capturedToolNames: string[][] = [];
      const capturedMessages: ChatMessage[][] = [];
      vi.mocked(service.chatStream).mockImplementation(async function* (messages, options) {
        capturedMessages.push([...messages]);
        capturedToolNames.push((options?.tools ?? []).map((tool) => tool.function.name));
        if (capturedMessages.length === 1) {
          yield* responseToStream(
            toolCallResponse('CreateSkill', {
              target: 'project',
              skill: {
                name: 'story-review',
                description: 'Review story structure.',
                body: '# Story Review',
              },
            }),
          );
          return;
        }
        yield* responseToStream(textResponse('Created the portable Skill.'));
      });

      await collectEvents(session.execute('创建 story-review Skill'));

      expect(capturedToolNames[0]).toContain('CreateSkill');
      expect(createSkill).toHaveBeenCalledWith({
        target: 'project',
        skill: {
          name: 'story-review',
          description: 'Review story structure.',
          body: '# Story Review',
        },
      });
      expect(JSON.stringify(capturedMessages[1])).toContain(
        '/workspace/.agents/skills/story-review',
      );
      expect(activateSkill).not.toHaveBeenCalled();
      expect(deactivateSkill).not.toHaveBeenCalled();
    });

    it('exposes lifecycle reference skill tools on the next model call without restricting the domain policy', async () => {
      const service = createMockService();
      const toolRegistry = new ToolRegistry();
      toolRegistry.register(
        createTool({
          name: 'canvas.createStoryboardFromMarkdown',
          description: 'Create Canvas storyboard nodes from Markdown.',
          category: 'project',
          parameters: { type: 'object', properties: {} },
          execute: async () => ({ success: true, data: { nodeIds: ['shot-1'] } }),
        }),
      );
      const toolGroupRegistry = new ToolGroupRegistry();
      toolGroupRegistry.register({
        name: 'canvas-editing',
        description: 'Canvas editing tools.',
        tools: ['canvas.createStoryboardFromMarkdown'],
        source: 'builtin',
        enabled: true,
        loadingTier: 'eager',
      });
      const session = new AgentSession(
        createConfig({
          service,
          toolRegistry,
          toolGroupRegistry,
          conversationId: 'conversation-canvas-reference-skill',
          systemPrompt: 'Base prompt.',
          maxIterations: 3,
        }),
      );
      const permHooks = (session as unknown as Record<string, unknown>)['_permissionHooks'] as
        { addAllowRule: (tool: string) => void } | undefined;
      permHooks?.addAllowRule('ActivateSkill');
      const activateSkill = vi.fn(async () => {
        session.applySkillLifecycleProjection({
          promptSections: [
            {
              id: 'skill:referenceSkill:canvas-authoring:record-canvas',
              layer: 'skill',
              content: 'Canvas authoring guidance.',
              priority: 100,
              recordId: 'record-canvas',
              slot: 'referenceSkill',
              skillName: 'canvas-authoring',
            },
          ],
          toolPolicy: {
            mode: 'unrestricted',
            activationTools: ['canvas.createStoryboardFromMarkdown'],
            contributingRecordIds: ['record-canvas'],
            diagnostics: [],
          },
          diagnostics: [],
          visibleIndicators: [
            {
              id: 'record-canvas',
              skillName: 'canvas-authoring',
              slot: 'referenceSkill',
              owner: 'agent',
              clearable: true,
              status: 'active',
            },
          ],
        });
        return {
          success: true,
          skillName: 'canvas-authoring',
          allowedTools: ['canvas.createStoryboardFromMarkdown'],
          lifecycleRecordId: 'record-canvas',
        };
      });
      session.setSkillProvider({
        listSkills: vi.fn(() => [
          {
            name: 'canvas-authoring',
            description: 'Canvas authoring guidance.',
          },
        ]),
        getActiveSkill: vi.fn(() => null),
        activateSkill,
        deactivateSkill: vi.fn(),
      });

      const capturedToolNames: string[][] = [];
      vi.mocked(service.chatStream).mockImplementation(async function* (_messages, options) {
        capturedToolNames.push((options?.tools ?? []).map((tool) => tool.function.name));
        if (capturedToolNames.length === 1) {
          yield* responseToStream(
            toolCallResponse('ActivateSkill', {
              skillName: 'canvas-authoring',
              reason: 'Send the completed storyboard table to Canvas.',
              slot: 'referenceSkill',
            }),
          );
          return;
        }
        yield* responseToStream(textResponse('Canvas tools are available.'));
      });

      await collectEvents(session.execute('发送到 Canvas'));

      expect(activateSkill).toHaveBeenCalledOnce();
      expect(capturedToolNames).toHaveLength(2);
      expect(capturedToolNames[0]).not.toContain('canvas.createStoryboardFromMarkdown');
      expect(capturedToolNames[1]).toContain('canvas.createStoryboardFromMarkdown');
      expect(session.isToolAllowed('UnrelatedDomainTool')).toBe(true);
    });

    it('should clear tracked rules even without permissionHooks', () => {
      const session = new AgentSession(config);

      session.applySkillInjection({
        name: 'test-skill',
        systemPrompt: 'Test prompt',
        allowedTools: ['Read'],
        type: 'skill',
      });

      // Should not throw when removing
      expect(() => session.removeSkillInjection('test-skill')).not.toThrow();
    });

    it('should remove prompt section on removeSkillInjection', () => {
      const session = new AgentSession(config);

      session.applySkillInjection({
        name: 'test-skill',
        systemPrompt: 'Skill-specific instructions',
        type: 'skill',
      });

      // System prompt should include skill content
      const historyBefore = session.getHistory();
      expect(historyBefore[0]!.content).toContain('Skill-specific instructions');

      session.removeSkillInjection('test-skill');

      // System prompt should no longer include skill content
      const historyAfter = session.getHistory();
      expect(historyAfter[0]!.content).not.toContain('Skill-specific instructions');
    });

    it('should activate lazy ToolSets for allowed tools on applySkillInjection', () => {
      const toolGroupRegistry = new ToolGroupRegistry();
      registerBuiltinToolGroups(toolGroupRegistry);
      const session = new AgentSession(createConfig({ toolGroupRegistry }));
      const toolInjectionManager = (session as unknown as Record<string, unknown>)[
        '_toolInjectionManager'
      ] as { getState(): { activeToolSets: string[] }; getToolsForTurn(input: string): string[] };

      expect(toolInjectionManager.getState().activeToolSets).not.toContain('ai-generation');

      session.applySkillInjection({
        name: 'image',
        systemPrompt: 'Generate media assets.',
        allowedTools: [TOOL_NAMES_MEDIA.GENERATE_IMAGE],
        type: 'skill',
      });

      expect(toolInjectionManager.getState().activeToolSets).toContain('ai-generation');
      expect(toolInjectionManager.getToolsForTurn('generate an image')).toContain(
        TOOL_NAMES_MEDIA.GENERATE_IMAGE,
      );

      session.removeSkillInjection('image');

      expect(toolInjectionManager.getState().activeToolSets).not.toContain('ai-generation');
    });

    it('should expose image generation tools for media model metadata during execute', async () => {
      const session = new AgentSession(config);
      const toolInjectionManager = (session as unknown as Record<string, unknown>)[
        '_toolInjectionManager'
      ] as { getState(): { activeToolSets: string[] }; getToolsForTurn(input: string): string[] };
      const mockExec = injectMockExecutor(session, []);
      mockExec.executeStream.mockImplementationOnce(async function* () {
        expect(toolInjectionManager.getState().activeToolSets).toContain('ai-generation');
        expect(toolInjectionManager.getToolsForTurn('生成猫猫图片')).toContain(
          TOOL_NAMES_MEDIA.GENERATE_IMAGE,
        );
        yield {
          type: 'think',
          content: 'done',
          timestamp: 1,
        };
      });

      expect(toolInjectionManager.getState().activeToolSets).not.toContain('ai-generation');

      await collectEvents(
        session.execute('生成猫猫图片', {
          metadata: {
            mediaModels: {
              image: { providerId: 'openai', modelId: 'gpt-image-1' },
            },
          },
        }),
      );

      expect(mockExec.executeStream).toHaveBeenCalled();
      expect(toolInjectionManager.getState().activeToolSets).not.toContain('ai-generation');
    });
  });

  // -------------------------------------------------------------------------
  // 10. dispose()
  // -------------------------------------------------------------------------

  describe('dispose()', () => {
    it('should cancel execution and clear pending confirmations', () => {
      const session = new AgentSession(config);
      const mockExec = injectMockExecutor(session, []);

      session.dispose();

      expect(mockExec.abort).toHaveBeenCalled();
      expect(session.isRunning()).toBe(false);
      expect(session.getPendingConfirmations()).toEqual([]);
    });
  });

  describe('feedback observation', () => {
    beforeEach(() => {
      config = createConfig({
        toolResultValidationAdapters: [createQualityReviewValidationAdapter()],
      });
    });

    it('captures tool failures as repair feedback cycles', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [{ id: 'call-write', name: 'Write', arguments: { path: 'brief.md' } }],
          toolResults: [
            {
              callId: 'call-write',
              success: false,
              error: 'permission denied',
            } as ToolResultWithMeta,
          ],
          timestamp: 100,
        },
      ]);

      await collectEvents(session.execute('write the draft'));

      expect(session.getValidationCycles()).toEqual([
        expect.objectContaining({
          signals: [
            expect.objectContaining({
              kind: 'tool-failure',
              observedAt: 100,
              toolCallId: 'call-write',
              toolName: 'Write',
              error: 'permission denied',
            }),
          ],
          decisions: [
            expect.objectContaining({
              action: 'repair',
              signalKind: 'tool-failure',
              toolCallId: 'call-write',
              toolName: 'Write',
              error: 'permission denied',
            }),
          ],
          actions: [
            {
              kind: 'set-guidance',
              guidance:
                '- Repair the failed tool step for Write. Diagnose the error "permission denied" and choose a safer substitute if needed.',
              signalKinds: ['tool-failure'],
            },
          ],
        }),
      ]);
    });

    it('records subagent review evidence and routes reviewer guidance without spawning subagents', async () => {
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(createConfig({ journalWriter }));
      (session as unknown as { _currentTurnContext: unknown })._currentTurnContext = {
        metadata: {
          multimodalContextPacket: { id: 'ctx-subagent-review' },
        },
      };
      const evidence = createSubagentReviewEvidence({
        id: 'evidence-subagent-shot-3',
        reviewerId: 'reviewer-style-consistency',
        requestId: 'review-request-shot-3',
        summary: 'Reviewer confirms shot 3 style drift.',
        observationId: 'obs-shot-3-style-drift',
        createdAt: 18,
      });

      await session.recordSubagentReviewResult({
        requestId: 'review-request-shot-3',
        reviewerId: 'reviewer-style-consistency',
        summary: 'Recommend minimal prompt adjustment.',
        evidence: [evidence],
        recommendations: [
          {
            id: 'guidance-shot-3-minimal-prompt-adjustment',
            rationaleId: 'rat-shot-3-recovery-guidance',
            kind: 'adjust-prompt',
            summary: 'Regenerate only shot 3 with a tighter style prompt.',
            recommendedNextStep: 'Adjust the shot 3 prompt before any generation tool call.',
            evidenceIds: ['evidence-subagent-shot-3'],
            createdAt: 19,
          },
        ],
        createdAt: 18,
      });

      expect(journalWriter.appendEvent).toHaveBeenCalledWith(1, {
        type: 'agent.evidence.attached',
        agentEvidence: { ...evidence, contextPacketId: 'ctx-subagent-review' },
      });
      expect(session.getValidationCycles()[0]).toEqual(
        expect.objectContaining({
          signals: [expect.objectContaining({ kind: 'subagent-review' })],
          decisions: [
            expect.objectContaining({
              action: 'continue',
              signalKind: 'subagent-review',
              requestId: 'review-request-shot-3',
              reviewerId: 'reviewer-style-consistency',
            }),
          ],
          actions: [expect.objectContaining({ kind: 'set-guidance' })],
        }),
      );
    });

    it('skips Agent-first evidence journaling when no context packet is active', async () => {
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(createConfig({ journalWriter }));
      const evidence = createSubagentReviewEvidence({
        id: 'evidence-subagent-no-context',
        reviewerId: 'reviewer-style-consistency',
        requestId: 'review-request-no-context',
        summary: 'Reviewer confirms uncertainty but no active context packet exists.',
        createdAt: 18,
      });

      await session.recordSubagentReviewResult({
        requestId: 'review-request-no-context',
        reviewerId: 'reviewer-style-consistency',
        summary: 'No context packet available.',
        evidence: [evidence],
        recommendations: [],
        createdAt: 18,
      });

      expect(journalWriter.appendEvent).not.toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ type: 'agent.evidence.attached' }),
      );
      expect(session.getValidationCycles()[0]?.signals[0]).toEqual(
        expect.objectContaining({ kind: 'subagent-review' }),
      );
    });

    it('captures canonical QualityCheck Gate results by correlating tool call ids', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [
            {
              id: 'call-qc',
              name: 'QualityCheck',
              arguments: {
                target: {
                  targetId: 'scene-2',
                  resourceRef: qualityReviewResourceRef,
                  revision: 'rev-1',
                },
                profileId: 'video-clip',
              },
            },
          ],
          toolResults: [
            {
              callId: 'call-qc',
              success: true,
              data: createSessionQualityGateResult(),
            } as ToolResultWithMeta,
          ],
          timestamp: 200,
        },
      ]);

      await collectEvents(session.execute('check scene quality'));

      expect(session.getValidationCycles()).toEqual([
        expect.objectContaining({
          signals: [
            expect.objectContaining({
              kind: 'tool-review',
              observedAt: 200,
              toolCallId: 'call-qc',
              toolName: 'QualityCheck',
              status: 'failed',
              summary:
                'Quality Gate failed for target scene-2: 0 stale evidence item(s), 1 diagnostic(s), and 1 repair action(s).',
              metadata: expect.objectContaining({
                verdict: 'fail',
                effectiveVerdict: 'fail',
                targetId: 'scene-2',
                targetKind: 'video-clip',
                evidenceCount: 2,
                repairActionCount: 1,
                contractValid: true,
              }),
              evidence: expect.objectContaining({
                id: 'quality-gate:runless:call-qc',
                source: 'tool',
                toolName: 'QualityCheck',
                data: expect.objectContaining({
                  kind: 'quality-gate',
                  qualityGateResult: expect.objectContaining({
                    gateResultId: 'gate-scene-2-v1',
                  }),
                }),
              }),
            }),
          ],
          decisions: [
            expect.objectContaining({
              action: 'repair',
              signalKind: 'tool-review',
              toolCallId: 'call-qc',
              toolName: 'QualityCheck',
              repeatKey: 'quality-gate:runless:scene-2',
              evidenceId: 'quality-gate:runless:call-qc',
            }),
          ],
          actions: [
            {
              kind: 'set-guidance',
              guidance:
                '- Use the owning capability to repair target scene-2, create a new revision, invalidate prior evidence, and rerun QualityCheck. Plan: Regenerate the damaged clip.',
              signalKinds: ['tool-review'],
            },
          ],
        }),
      ]);
    });

    it('records QualityReview evidence into the Agent-first journal graph', async () => {
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(
        createConfig({
          journalWriter,
          toolResultValidationAdapters: [createQualityReviewValidationAdapter()],
        }),
      );
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [{ id: 'call-qc', name: 'QualityCheck', arguments: {} }],
          toolResults: [
            {
              callId: 'call-qc',
              success: true,
              data: createSessionQualityGateResult(),
            } as ToolResultWithMeta,
          ],
          timestamp: 200,
        },
      ]);

      await collectEvents(
        session.execute('check scene quality', {
          metadata: {
            multimodalContextPacket: {
              id: 'ctx-quality-review',
              selection: [],
              artifactRefs: [],
              projectRefs: [],
              perceptionInputs: [],
              uiContext: { activePanel: 'canvas', selectionIds: [] },
              createdAt: 200,
            },
          },
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(journalWriter.appendEvent).toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({
          type: 'agent.evidence.attached',
          agentEvidence: expect.objectContaining({
            id: 'quality-gate:runless:call-qc',
            source: 'tool',
            toolName: 'QualityCheck',
            contextPacketId: 'ctx-quality-review',
          }),
        }),
      );
    });

    it('captures provider expression metadata as feedback observations', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [{ id: 'call-img', name: 'GenerateImage', arguments: {} }],
          toolResults: [
            {
              callId: 'call-img',
              success: true,
              data: {
                taskId: 'image-task',
                providerAdaptation: {
                  mode: 'agentic',
                  providerId: 'sdxl',
                  extractedIntent: { styleFamily: 'anime', style: ['anime'] },
                  adaptationMetadata: { riskFlags: ['agent-expression-context-only'] },
                },
              },
              name: 'GenerateImage',
            } as ToolResultWithMeta,
          ],
          timestamp: 300,
        },
      ]);

      await collectEvents(session.execute('generate anime image'));

      expect(session.getValidationCycles()).toEqual([
        expect.objectContaining({
          signals: [
            expect.objectContaining({
              kind: 'provider-card-observation',
              observedAt: 300,
              toolCallId: 'call-img',
              toolName: 'GenerateImage',
              mode: 'agentic',
              providerId: 'sdxl',
            }),
          ],
          decisions: [
            expect.objectContaining({
              action: 'continue',
              signalKind: 'provider-card-observation',
              toolCallId: 'call-img',
              reason: 'agent-expression-context-only',
              styleFamily: 'anime',
            }),
          ],
        }),
      ]);
    });

    it('injects feedback guidance into the next turn only, then clears it after consumption', async () => {
      const session = new AgentSession(config);
      injectMockExecutor(session, [
        {
          type: 'act',
          content: 'Executed 1 tool(s)',
          toolCalls: [{ id: 'call-write', name: 'Write', arguments: { path: 'brief.md' } }],
          toolResults: [
            {
              callId: 'call-write',
              success: false,
              error: 'permission denied',
            } as ToolResultWithMeta,
          ],
          timestamp: 300,
        },
      ]);

      await collectEvents(session.execute('write the draft'));

      let secondTurnPrompt = '';
      const secondTurnExecutor = injectMockExecutor(session, [
        { type: 'think', content: 'Retrying with guidance', timestamp: 301 },
      ]);
      secondTurnExecutor.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        secondTurnPrompt = String(options?.messages?.[0]?.content ?? '');
        yield { type: 'think', content: 'Retrying with guidance', timestamp: 301 };
      });

      await collectEvents(session.execute('try again'));

      expect(secondTurnPrompt).toContain('## Validation Guidance');
      expect(secondTurnPrompt).toContain('permission denied');

      let thirdTurnPrompt = '';
      const thirdTurnExecutor = injectMockExecutor(session, [
        { type: 'think', content: 'Normal turn', timestamp: 302 },
      ]);
      thirdTurnExecutor.executeStream.mockImplementationOnce(async function* (...args: unknown[]) {
        const options = args[1] as { messages?: ChatMessage[] } | undefined;
        thirdTurnPrompt = String(options?.messages?.[0]?.content ?? '');
        yield { type: 'think', content: 'Normal turn', timestamp: 302 };
      });

      await collectEvents(session.execute('one more turn'));

      expect(thirdTurnPrompt).not.toContain('## Validation Guidance');
    });
  });

  describe('semantic stream boundaries', () => {
    function spyOnCompactionChecks(session: AgentSession) {
      const compressor = (
        session as unknown as {
          _compressor: { estimateTokens(messages: readonly ChatMessage[]): number };
        }
      )._compressor;
      return vi.spyOn(compressor, 'estimateTokens');
    }

    it('yields 4,000 text fragments without journaling or compacting per chunk', async () => {
      const journalWriter = createMockJournalWriter();
      const session = new AgentSession(createConfig({ journalWriter }));
      const fixture = createTableHeavyStreamFixture();
      const chunks = fixture.chunks;
      injectMockExecutor(session, [
        ...chunks.map((content, index): AgentStep => ({
          type: 'content_delta',
          content,
          timestamp: index,
        })),
        {
          type: 'think',
          content: chunks.join(''),
          timestamp: chunks.length,
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        },
      ]);
      const estimateTokens = spyOnCompactionChecks(session);

      const events = await collectEvents(session.execute('stream'));

      expect(events.filter((event) => event.type === 'text_delta')).toHaveLength(
        fixture.chunks.length,
      );
      expect(
        events
          .filter((event) => event.type === 'text_delta')
          .map((event) => event.content)
          .join(''),
      ).toBe(fixture.source);
      expect(events.filter((event) => event.type === 'text')).toHaveLength(0);
      expect(estimateTokens).toHaveBeenCalledTimes(2);
      expect(journalWriter.appendEvent.mock.calls.length).toBeLessThan(10);
      expect(journalWriter.appendEvent).not.toHaveBeenCalledWith(
        expect.any(Number),
        expect.objectContaining({ type: 'text_delta' }),
      );
      expect(events.at(-1)).toEqual({
        type: 'done',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      });
    });

    it('keeps replacement retries transport-only until final text commits', async () => {
      const session = new AgentSession(createConfig());
      injectMockExecutor(session, [
        { type: 'content_delta', content: 'invalid', timestamp: 1 },
        {
          type: 'content_delta',
          content: 'replacement',
          deltaKind: 'assistant_text_replacement',
          replacement: { reason: 'output-validation-retry', attempt: 2 },
          timestamp: 2,
        },
        { type: 'think', content: 'replacement', timestamp: 3 },
      ]);
      const estimateTokens = spyOnCompactionChecks(session);

      const events = await collectEvents(session.execute('retry'));

      expect(events.filter((event) => event.type === 'text_delta')).toHaveLength(1);
      expect(events.filter((event) => event.type === 'assistant_text_replacement')).toHaveLength(1);
      expect(session.getHistory().filter((message) => message.role === 'assistant')).toEqual([
        expect.objectContaining({ content: 'replacement' }),
      ]);
      expect(estimateTokens).toHaveBeenCalledTimes(2);
    });

    it('projects thinking once at the semantic boundary rather than per display fragment', async () => {
      const session = new AgentSession(createConfig());
      injectMockExecutor(session, [
        { type: 'content_delta', content: 'visible', timestamp: 1 },
        {
          type: 'think',
          content: 'visible',
          thinking: 'private reasoning summary',
          timestamp: 2,
        },
      ]);
      const estimateTokens = spyOnCompactionChecks(session);

      const events = await collectEvents(session.execute('thinking'));

      expect(events.filter((event) => event.type === 'thinking_content')).toEqual([
        expect.objectContaining({ thinking: 'private reasoning summary' }),
      ]);
      expect(estimateTokens).toHaveBeenCalledTimes(2);
    });

    it('checks compaction at each tool-backed working-memory mutation', async () => {
      const session = new AgentSession(createConfig());
      injectMockExecutor(session, [
        {
          type: 'think',
          content: '',
          toolCalls: [{ id: 'call-1', name: 'Read', arguments: {} }],
          timestamp: 1,
        },
        {
          type: 'act',
          content: '',
          toolResults: [{ callId: 'call-1', name: 'Read', success: true, data: 'ok' }],
          timestamp: 2,
        },
        { type: 'observe', content: '', timestamp: 3 },
        { type: 'respond', content: 'done', timestamp: 4 },
      ]);
      const estimateTokens = spyOnCompactionChecks(session);

      await collectEvents(session.execute('tools'));

      expect(estimateTokens).toHaveBeenCalledTimes(4);
      expect(session.getHistory().map((message) => message.role)).toEqual([
        'system',
        'user',
        'assistant',
        'tool',
        'assistant',
      ]);
    });

    it('isolates semantic and compaction counts across concurrent sessions', async () => {
      const sessionA = new AgentSession(createConfig({ conversationId: 'conversation-a' }));
      const sessionB = new AgentSession(createConfig({ conversationId: 'conversation-b' }));
      injectMockExecutor(sessionA, [
        { type: 'content_delta', content: 'A', timestamp: 1 },
        { type: 'think', content: 'A', timestamp: 2 },
      ]);
      injectMockExecutor(sessionB, [
        { type: 'content_delta', content: 'B', timestamp: 1 },
        { type: 'think', content: 'B', timestamp: 2 },
      ]);
      const estimateA = spyOnCompactionChecks(sessionA);
      const estimateB = spyOnCompactionChecks(sessionB);

      await Promise.all([
        collectEvents(sessionA.execute('a')),
        collectEvents(sessionB.execute('b')),
      ]);

      expect(estimateA).toHaveBeenCalledTimes(2);
      expect(estimateB).toHaveBeenCalledTimes(2);
      expect(sessionA.getHistory().at(-1)?.content).toBe('A');
      expect(sessionB.getHistory().at(-1)?.content).toBe('B');
    });
  });
});
