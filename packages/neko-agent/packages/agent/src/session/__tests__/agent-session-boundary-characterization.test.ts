import { describe, expect, it, vi } from 'vitest';
import {
  createTool,
  type AgentValidationCoordinator,
  type AgentValidationCycle,
  type AgentValidationEvaluationContext,
  type AgentValidationMemoryExtractionInput,
  type AgentValidationMemoryExtractionOutcome,
  type IService,
  type StreamChunk,
} from '@neko/shared';
import type { Draft, ExecutionPlan, Task } from '@neko-agent/types';
import { AgentSession } from '../agent-session';
import type { AgentEvent, AgentSessionConfig, ExecutionMode, IJournalWriter } from '../types';
import { ToolRegistry } from '../../tools/tool-registry';
import type {
  AnyArtifactRecord,
  ArtifactObservedInput,
  ArtifactRecord,
  ArtifactWriteInput,
  IArtifactService,
} from '../../runtime/artifact-service';

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const values: T[] = [];
  for await (const value of iterable) {
    values.push(value);
  }
  return values;
}

function createTextService(text = 'done'): IService {
  return {
    chat: async () => ({
      id: 'response-1',
      model: 'test-model',
      message: { role: 'assistant', content: text },
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    }),
    chatStream: () => streamText(text),
    embed: async () => ({ embeddings: [] }),
  };
}

async function* streamText(text: string): AsyncIterable<StreamChunk> {
  yield { type: 'content', content: text };
  yield {
    type: 'done',
    finishReason: 'stop',
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
  };
}

function createToolCallService(): IService {
  let call = 0;
  return {
    chat: async () => {
      throw new Error('chat() is not used');
    },
    chatStream: () => {
      call += 1;
      return call === 1 ? streamToolCall() : streamText('wrote file');
    },
    embed: async () => ({ embeddings: [] }),
  };
}

function createEmptyStreamService(): IService {
  return {
    chat: async () => ({
      id: 'empty-response',
      model: 'test-model',
      message: { role: 'assistant', content: '' },
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }),
    chatStream: () => streamEmptyResponse(),
    embed: async () => ({ embeddings: [] }),
  };
}

async function* streamToolCall(): AsyncIterable<StreamChunk> {
  yield {
    type: 'tool_call',
    toolCall: {
      id: 'call-write',
      type: 'function',
      function: { name: 'WriteFile', arguments: '{"path":"out.txt","content":"hello"}' },
    },
  };
  yield {
    type: 'done',
    finishReason: 'tool_calls',
    usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
  };
}

async function* streamEmptyResponse(): AsyncIterable<StreamChunk> {
  yield {
    type: 'done',
    finishReason: 'stop',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

function createConfig(overrides: Partial<AgentSessionConfig> = {}): AgentSessionConfig {
  return {
    service: createTextService(),
    toolRegistry: new ToolRegistry(),
    systemPrompt: 'You are a boundary characterization agent.',
    conversationId: 'conv-boundary',
    maxIterations: 3,
    ...overrides,
  };
}

function readCompressorTokenThreshold(session: AgentSession): number {
  return (
    (session as unknown as Record<string, { getConfig: () => { triggers: { tokenThreshold: number } } }>)[
      '_compressor'
    ]
  ).getConfig().triggers.tokenThreshold;
}

class CapturingJournalWriter implements IJournalWriter {
  readonly events: AgentEvent[] = [];
  readonly snapshots: Array<{
    historyLength: number;
    executionMode: ExecutionMode;
    versionLogSize: number;
  }> = [];
  readonly appendEvent = vi.fn(async (_seq: number, event: AgentEvent) => {
    this.events.push(event);
    return `event-${this.events.length}`;
  });
  readonly appendSnapshot = vi.fn(
    async (
      _seq: number,
      snapshot: {
        historyLength: number;
        executionMode: NonNullable<AgentSessionConfig['executionMode']>;
        versionLogSize: number;
      },
    ) => {
      this.snapshots.push(snapshot);
    },
  );
  readonly flush = vi.fn(async () => {});
  readonly dispose = vi.fn(async () => {});
}

class MemoryArtifactService implements IArtifactService {
  readonly records = new Map<string, Map<AnyArtifactRecord['kind'], AnyArtifactRecord>>();
  readonly creationIdsByRun = new Map<string, string>();
  readonly restore = vi.fn(async () => []);
  readonly flush = vi.fn(async () => {});
  readonly dispose = vi.fn(async () => {});

  write(input: ArtifactWriteInput<'draft'>): Promise<ArtifactRecord<'draft'>>;
  write(input: ArtifactWriteInput<'plan'>): Promise<ArtifactRecord<'plan'>>;
  write(input: ArtifactWriteInput<'task'>): Promise<ArtifactRecord<'task'>>;
  async write(input: ArtifactWriteInput): Promise<AnyArtifactRecord> {
    switch (input.kind) {
      case 'draft':
        return this.writeDraft(input.runId, input.value as Draft);
      case 'plan':
        return this.writePlan(input.runId, input.value as ExecutionPlan);
      case 'task':
        return this.writeTask(input.runId, input.value as Task);
    }
  }

  async writeDraft(runId: string, draft: Draft): Promise<ArtifactRecord<'draft'>> {
    const creationId = this.creationIdForRun(runId, draft.id);
    return this.remember({
      kind: 'draft',
      runId,
      artifactId: draft.id,
      path: `neko/creations/${creationId}/brief.md`,
      updatedAt: draft.updatedAt,
      content: draft.title,
      value: draft,
    });
  }

  async writePlan(runId: string, plan: ExecutionPlan): Promise<ArtifactRecord<'plan'>> {
    const creationId = this.creationIdForRun(runId, plan.draftId);
    return this.remember({
      kind: 'plan',
      runId,
      artifactId: plan.id,
      path: `neko/creations/${creationId}/plan.md`,
      updatedAt: plan.updatedAt,
      content: plan.title,
      value: plan,
    });
  }

  async writeTask(runId: string, task: Task): Promise<ArtifactRecord<'task'>> {
    const creationId = this.creationIdForRun(runId, task.id);
    return this.remember({
      kind: 'task',
      runId,
      artifactId: task.id,
      path: `neko/creations/${creationId}/checklist.md`,
      updatedAt: task.updatedAt,
      content: task.id,
      value: task,
    });
  }

  ingestObservedArtifact(input: ArtifactObservedInput<'draft'>): ArtifactRecord<'draft'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'plan'>): ArtifactRecord<'plan'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'task'>): ArtifactRecord<'task'>;
  ingestObservedArtifact(input: ArtifactObservedInput): AnyArtifactRecord {
    const now = Date.now();
    switch (input.kind) {
      case 'draft':
        return this.remember({
          kind: 'draft',
          runId: input.runId,
          artifactId: `draft-${input.runId}`,
          path: input.path,
          updatedAt: now,
          content: input.content,
          value: createDraft(`draft-${input.runId}`, now),
        });
      case 'plan':
        return this.remember({
          kind: 'plan',
          runId: input.runId,
          artifactId: `plan-${input.runId}`,
          path: input.path,
          updatedAt: now,
          content: input.content,
          value: createPlan(`plan-${input.runId}`, now),
        });
      case 'task':
        return this.remember({
          kind: 'task',
          runId: input.runId,
          artifactId: `task-${input.runId}`,
          path: input.path,
          updatedAt: now,
          content: input.content,
          value: createTask(`task-${input.runId}`, now),
        });
    }
  }

  getByRunId(runId: string, kind: 'draft'): ArtifactRecord<'draft'> | null;
  getByRunId(runId: string, kind: 'plan'): ArtifactRecord<'plan'> | null;
  getByRunId(runId: string, kind: 'task'): ArtifactRecord<'task'> | null;
  getByRunId(runId: string, kind: AnyArtifactRecord['kind']): AnyArtifactRecord | null {
    return this.records.get(runId)?.get(kind) ?? null;
  }

  listRunIds(): readonly string[] {
    return Array.from(this.records.keys());
  }

  listByRunId(runId: string): readonly AnyArtifactRecord[] {
    return Array.from(this.records.get(runId)?.values() ?? []);
  }

  getCreationIdByRunId(runId: string): string | null {
    return this.creationIdsByRun.get(runId) ?? null;
  }

  private remember<T extends AnyArtifactRecord>(record: T): T {
    const creationId = extractCreationId(record.path);
    if (creationId) {
      this.creationIdsByRun.set(record.runId, creationId);
    }
    const byKind = this.records.get(record.runId) ?? new Map();
    byKind.set(record.kind, record);
    this.records.set(record.runId, byKind);
    return record;
  }

  private creationIdForRun(runId: string, seed: string): string {
    const existing = this.creationIdsByRun.get(runId);
    if (existing) {
      return existing;
    }
    const creationId = `creation-${seed}`;
    this.creationIdsByRun.set(runId, creationId);
    return creationId;
  }
}

function extractCreationId(path: string): string | null {
  const match = /(?:^|\/)neko\/creations\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

class OneShotFeedbackCoordinator implements AgentValidationCoordinator {
  private used = false;
  readonly observe = vi.fn();
  readonly dispose = vi.fn();
  readonly getBeforeThinkHooks = () => [];
  readonly getSignalHistory = () => [];
  readonly getDecisionHistory = () => [];
  readonly getActionHistory = () => [];
  readonly extractMemory = async (
    _input: AgentValidationMemoryExtractionInput,
  ): Promise<AgentValidationMemoryExtractionOutcome> => ({
    kind: 'skipped',
    timestamp: 100,
    sourceEventIds: [],
    reason: 'disabled',
  });

  evaluatePending(context: AgentValidationEvaluationContext = {}): AgentValidationCycle | null {
    if (this.used) {
      return null;
    }
    this.used = true;
    return {
      timestamp: 100,
      currentStage: context.currentStage,
      activeRunId: context.activeRunId,
      signals: [],
      decisions: [{ action: 'continue', reason: 'no-actionable-signal' }],
      actions: [
        {
          kind: 'set-guidance',
          guidance: '- Retry with a smaller edit.',
          signalKinds: ['tool-failure'],
        },
      ],
    };
  }
}

describe('AgentSession boundary characterization', () => {
  it('surfaces an error instead of completing when the model returns no content or tool calls', async () => {
    const session = new AgentSession(
      createConfig({
        service: createEmptyStreamService(),
      }),
    );

    const events = await collect(session.execute('empty response'));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({
            message:
              'The selected chat model completed without returning text, tool calls, thinking, or an error. Please retry or choose another model.',
          }),
        }),
      ]),
    );
    expect(events).not.toEqual(expect.arrayContaining([expect.objectContaining({ type: 'done' })]));
    session.dispose();
  });

  it('dispatches ordinary turns without legacy IDC run controls', async () => {
    const journalWriter = new CapturingJournalWriter();
    const session = new AgentSession(
      createConfig({
        journalWriter,
        stageTracking: { guardian: false },
      }),
    );

    const events = await collect(session.execute('hello'));

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'text_delta', content: 'done' }),
        expect.objectContaining({ type: 'done' }),
      ]),
    );
    expect(journalWriter.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['user_message', 'text', 'done']),
    );
    expect(journalWriter.appendSnapshot).toHaveBeenCalledTimes(1);
    expect(session.getHistory().map((message) => message.role)).toEqual(
      expect.arrayContaining(['system', 'user', 'assistant']),
    );
    expect(session.getCurrentStage()).toBe('apply');

    session.dispose();
    expect(journalWriter.dispose).toHaveBeenCalledTimes(1);
  });

  it('preserves tool confirmation flow in ask mode', async () => {
    const registry = new ToolRegistry();
    const execute = vi.fn(async () => ({ success: true, data: { path: 'out.txt' } }));
    registry.register(
      createTool({
        name: 'WriteFile',
        description: 'Write a file',
        category: 'file',
        parameters: { type: 'object', properties: {}, required: [] },
        execute,
      }),
    );
    const onConfirmTool = vi.fn(async () => true);
    const session = new AgentSession(
      createConfig({
        service: createToolCallService(),
        toolRegistry: registry,
        executionMode: 'ask',
        onConfirmTool,
      }),
    );

    const events = await collect(session.execute('write it'));

    expect(onConfirmTool).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({ id: 'call-write', name: 'WriteFile' }),
      }),
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(events).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'done' })]));
    expect(session.getPendingConfirmations()).toEqual([]);
    session.dispose();
  });

  it('preserves context compression through the public session API', async () => {
    const session = new AgentSession(createConfig());
    for (let i = 0; i < 12; i++) {
      session.addMessage({ role: 'user', content: `user message ${i}` });
      session.addMessage({ role: 'assistant', content: `assistant response ${i}` });
    }

    const beforeLength = session.getHistory().length;
    const result = await session.compressContext();

    expect(result.originalTokens).toBeGreaterThan(0);
    expect(result.compressedTokens).toBeGreaterThan(0);
    expect(session.getHistory().length).toBeLessThan(beforeLength);
    expect(session.getHistory()[0]?.role).toBe('system');
    session.dispose();
  });

  it('updates auto-compact threshold from context settings without reading output max tokens', () => {
    const session = new AgentSession(
      createConfig({
        maxTokens: 8192,
        contextSettings: { maxTokens: 120000 },
      }),
    );

    expect(readCompressorTokenThreshold(session)).toBe(120000);

    session.configure({ maxTokens: 256000, contextSettings: { maxTokens: 50000 } });

    expect(readCompressorTokenThreshold(session)).toBe(50000);
    expect((session as unknown as { _config: AgentSessionConfig })._config.maxTokens).toBe(256000);
    session.dispose();
  });

  it('manual context compression preserves the configured output cap', async () => {
    const session = new AgentSession(createConfig({ maxTokens: 8192 }));
    for (let i = 0; i < 12; i++) {
      session.addMessage({ role: 'user', content: `user message ${i}` });
      session.addMessage({ role: 'assistant', content: `assistant response ${i}` });
    }

    await session.compressContext();

    expect((session as unknown as { _config: AgentSessionConfig })._config.maxTokens).toBe(8192);
    session.dispose();
  });

  it('preserves artifact write, restore visibility, feedback guidance, and flush behavior', async () => {
    const artifactService = new MemoryArtifactService();
    const validationCoordinator = new OneShotFeedbackCoordinator();
    const session = new AgentSession(
      createConfig({
        artifactService,
        validationCoordinator,
        stageTracking: { guardian: false },
      }),
    );
    const draft = createDraft('draft-1', 100);
    const plan = createPlan('plan-1', 101);
    const task = createTask('task-1', 102);

    const legacyTrace = { runId: 'legacy-trace-artifact' };
    await session.writeDraftArtifact(draft, legacyTrace);
    await session.writePlanArtifact(plan, legacyTrace);
    await session.writeTaskArtifact(task, legacyTrace);
    await session.flushWorkspaceSink();

    const artifactRunIds = session.listArtifactRunIds();
    expect(artifactRunIds).toHaveLength(1);
    expect(session.getArtifactsForRun(artifactRunIds[0]!).map((record) => record.kind)).toEqual([
      'draft',
      'plan',
      'task',
    ]);

    await collect(session.execute('apply feedback guidance'));

    expect(session.getValidationCycles()).toHaveLength(1);
    expect(String(session.getHistory()[0]?.content)).toContain('Retry with a smaller edit');
    session.dispose();
    expect(artifactService.dispose).toHaveBeenCalledTimes(1);
    expect(validationCoordinator.dispose).toHaveBeenCalledTimes(1);
  });
});

function createDraft(id: string, now: number): Draft {
  return {
    id,
    title: 'Test Draft',
    status: 'draft',
    domain: 'agent',
    createdAt: now,
    updatedAt: now,
    intent: 'intent',
    approach: 'approach',
    artifact: 'artifact',
  };
}

function createPlan(id: string, now: number): ExecutionPlan {
  return {
    id,
    draftId: 'draft-1',
    title: 'Test Plan',
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    steps: [],
  };
}

function createTask(id: string, now: number): Task {
  return {
    id,
    createdAt: now,
    updatedAt: now,
    items: [{ id: 'task-item-1', content: 'Do work', status: 'pending' }],
  };
}
