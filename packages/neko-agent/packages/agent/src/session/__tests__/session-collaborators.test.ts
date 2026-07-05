import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CapturedLogTransport,
  ConsoleLogger,
  LogLevel,
  createAgentTraceContext,
  type AgentCreativeProcessRecoveryPolicy,
  type AgentValidationCoordinator,
  type AgentValidationCycle,
  type AgentValidationEvaluationContext,
  type AgentValidationMemoryExtractionInput,
  type AgentValidationMemoryExtractionOutcome,
  type ChatMessage,
} from '@neko/shared';
import type {
  Draft,
  ExecutionArtifactWrittenEvent,
  ExecutionPlan,
  IdcStage,
  Task,
} from '@neko-agent/types';
import { SessionArtifactFacade } from '../session-artifact-facade';
import { ValidationRuntimeBridge } from '../validation-runtime-bridge';
import { PromptRuntimeFacade } from '../prompt-runtime-facade';
import type {
  AnyArtifactRecord,
  ArtifactScopeBinding,
  ArtifactObservedInput,
  ArtifactRecord,
  ArtifactWriteInput,
  IArtifactService,
} from '../../artifact/artifact-service';
import type { ICreationTaskProjection } from '../../task';
import { SystemPromptComposer } from '../../prompt/system-prompt-composer';
import { ModuleOrchestrator } from '../../prompt/composer/module-orchestrator';
import { PromptModuleRegistry } from '../../prompt/registry/module-registry';
import { PromptSectionCache } from '../../prompt/registry/section-cache';
import { ArtifactSchemaModule } from '../../prompt/modules/schema/artifact-schema-module';
import { ValidationGuidanceModule } from '../../prompt/modules/ephemeral/validation-guidance-module';
import { MemoryRecallModule } from '../../prompt/modules/memory/memory-recall-module';
import { CreativeVersionLogModule } from '../../prompt/modules/ephemeral/creative-version-log-module';
import { SubpackageFragmentsModule } from '../../prompt/modules/environment/subpackage-fragments-module';
import type { AgentExecutor } from '../../executor/agent-executor';
import { setRootLogger } from '../../utils/logger';

afterEach(() => {
  vi.useRealTimers();
});

describe('session runtime collaborators', () => {
  it('restores artifacts, writes artifacts, drains sync queues, and disposes services', async () => {
    const draft = createDraft('draft-1', 100);
    const restoredTask = createTask('task-restored', 101);
    const service = new MemoryArtifactService([
      createArtifactRecord('draft', 'activity-1', draft, 100),
      createArtifactRecord('task', 'activity-1', restoredTask, 101),
    ]);
    const projection = createTaskProjection();
    const bindArtifact = vi.fn();
    const onPersist = vi.fn();
    const facade = new SessionArtifactFacade({
      ports: {
        session: {
          getConversationId: () => 'conv-1',
        },
        activity: {
          getActiveArtifactScope: () => ({ id: 'activity-1', startedAt: 90 }),
          getArtifactScopeStartedAt: (scopeId) => (scopeId === 'activity-1' ? 90 : undefined),
          bindArtifact,
        },
        workspace: {
          getWorkspaceReadFile: () => vi.fn(async () => 'observed content'),
          isDisposed: () => false,
        },
        persistence: {
          onPersist,
        },
      },
    });
    facade.setArtifactService(service);
    facade.setTaskProjection(projection);

    facade.scheduleRestore();
    await facade.whenRestoreReady();
    await facade.flush();

    expect(bindArtifact).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({ kind: 'draft' }),
    );
    expect(bindArtifact).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({ kind: 'task' }),
    );
    expect(projection.syncTask).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        runId: 'activity-1',
        runStartedAt: 90,
        task: restoredTask,
      }),
    );

    const writtenPlan = await facade.writePlan(createPlan('plan-1', 102), 'activity-1');
    expect(writtenPlan.kind).toBe('plan');
    expect(onPersist).toHaveBeenCalledTimes(1);

    facade.queueObservedArtifactSync(createArtifactWrittenEvent('task', 'activity-1'));
    facade.queueTaskProjectionClear('activity-1', 90);
    await facade.flush();

    expect(bindArtifact).toHaveBeenCalledWith(
      'activity-1',
      expect.objectContaining({ kind: 'task' }),
    );
    expect(service.ingestObservedArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'task',
        runId: 'activity-1',
        content: 'observed content',
      }),
    );
    expect(projection.clearRun).toHaveBeenCalledWith('activity-1', 90);

    facade.dispose();
    expect(service.dispose).toHaveBeenCalledTimes(1);
  });

  it('warns on artifact restore failure and propagates write failures without poisoning later writes', async () => {
    const onWarn = vi.fn();
    const service = new MemoryArtifactService();
    service.restore.mockRejectedValueOnce(new Error('restore failed'));
    service.writePlanMock.mockImplementationOnce(() => {
      throw new Error('write failed');
    });
    const facade = createArtifactFacade({
      onWarn,
      activeRun: { id: 'activity-error', startedAt: 100 },
      readFile: vi.fn(async () => 'content'),
    });
    facade.setArtifactService(service);

    facade.scheduleRestore();
    await facade.whenRestoreReady();

    expect(onWarn).toHaveBeenCalledWith(
      'Failed to restore artifacts from workspace',
      expect.objectContaining({ error: expect.any(Error) }),
    );

    await expect(facade.writePlan(createPlan('plan-fail', 101), 'activity-error')).rejects.toThrow(
      'write failed',
    );

    await expect(facade.writePlan(createPlan('plan-ok', 102), 'activity-error')).resolves.toEqual(
      expect.objectContaining({ kind: 'plan', artifactId: 'plan-ok' }),
    );
  });

  it('warns on background artifact sync and task projection failures then recovers later queue work', async () => {
    const onWarn = vi.fn();
    let readFile = vi.fn(async () => {
      throw new Error('read failed');
    });
    const service = new MemoryArtifactService();
    const projection = createTaskProjection();
    projection.syncTask.mockRejectedValueOnce(new Error('projection failed'));
    const facade = createArtifactFacade({
      onWarn,
      activeRun: { id: 'activity-queue', startedAt: 100 },
      readFile: (path) => readFile(path),
    });
    facade.setArtifactService(service);
    facade.setTaskProjection(projection);

    facade.queueObservedArtifactSync(createArtifactWrittenEvent('task', 'activity-queue'));
    facade.queueTaskProjection('activity-queue', createTask('task-failed-projection', 101));
    await expect(facade.flush()).resolves.toBeUndefined();

    expect(onWarn).toHaveBeenCalledWith(expect.stringContaining('artifact sync failed'), undefined);
    expect(onWarn).toHaveBeenCalledWith(
      expect.stringContaining('Creation task projection failed for activity-queue'),
      undefined,
    );

    readFile = vi.fn(async () => 'recovered content');
    facade.queueObservedArtifactSync(createArtifactWrittenEvent('task', 'activity-queue'));
    facade.queueTaskProjectionClear('activity-queue', 100);
    await expect(facade.flush()).resolves.toBeUndefined();

    expect(service.ingestObservedArtifactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'task',
        runId: 'activity-queue',
        content: 'recovered content',
      }),
    );
    expect(projection.clearRun).toHaveBeenCalledWith('activity-queue', 100);
  });

  it('captures validation guidance, applies recovery guidance, and logs trace summaries', async () => {
    const transport = new CapturedLogTransport();
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));
    const cycle = createFeedbackCycle();
    const coordinator = createTestFeedbackCoordinator(cycle);
    const setPromptGuidanceContent = vi.fn();
    const syncSystemPrompt = vi.fn();
    const recordStageTransition = vi.fn(async () => {});
    const bridge = new ValidationRuntimeBridge({
      maxCycles: 1,
      ports: {
        validation: {
          getCoordinator: () => coordinator,
          isRecoveryGuidanceDisabled: () => false,
        },
        recovery: {
          getRecoveryPolicy: () => createControlPlane(),
          getCurrentStage: () => 'apply',
          getActiveArtifactScope: () => ({ id: 'activity-feedback', startedAt: 100 }),
          recordStageTransition,
        },
        prompt: {
          setGuidanceContent: setPromptGuidanceContent,
          syncSystemPrompt,
        },
        diagnostics: {
          debug: (message, data) => {
            const logger = new ConsoleLogger('Agent:ValidationTest', LogLevel.Debug, [transport]);
            logger.debug(message, data);
          },
        },
      },
    });

    const changed = await bridge.captureCycle(
      createAgentTraceContext({ conversationId: 'conv-feedback', turnId: 'turn-1' }),
    );
    expect(changed).toBe(true);
    expect(bridge.cycles).toHaveLength(1);
    expect(setPromptGuidanceContent).toHaveBeenCalledWith(
      expect.stringContaining('Retry with a smaller edit'),
    );
    expect(recordStageTransition).toHaveBeenCalledTimes(1);
    expect(transport.findByMessage('neko.agent.validation.cycle.captured')?.data).toEqual(
      expect.objectContaining({
        trace: expect.objectContaining({
          conversationId: 'conv-feedback',
          runId: 'activity-feedback',
          phase: 'validation',
        }),
        actionCount: 1,
        stageGuidanceCount: 1,
      }),
    );

    coordinator.setNextCycle(null);
    const skipped = await bridge.captureCycle(
      createAgentTraceContext({ conversationId: 'conv-feedback' }),
    );
    expect(skipped).toBe(false);
    expect(transport.findByMessage('neko.agent.validation.cycle.skipped')?.data).toEqual(
      expect.objectContaining({
        reason: 'no-pending-validation',
      }),
    );
  });

  it('surfaces validation stage transition persistence failures from captureCycle', async () => {
    const coordinator = createTestFeedbackCoordinator(createFeedbackCycle());
    const bridge = new ValidationRuntimeBridge({
      maxCycles: 4,
      ports: {
        validation: {
          getCoordinator: () => coordinator,
          isRecoveryGuidanceDisabled: () => false,
        },
        recovery: {
          getRecoveryPolicy: () => createControlPlane(),
          getCurrentStage: () => 'apply',
          getActiveArtifactScope: () => ({ id: 'activity-feedback-error', startedAt: 100 }),
          recordStageTransition: vi.fn(async () => {
            throw new Error('transition persist failed');
          }),
        },
        prompt: {
          setGuidanceContent: vi.fn(),
          syncSystemPrompt: vi.fn(),
        },
        diagnostics: {
          debug: vi.fn(),
        },
      },
    });

    await expect(
      bridge.captureCycle(createAgentTraceContext({ conversationId: 'conv-feedback-error' })),
    ).rejects.toThrow('transition persist failed');
    expect(bridge.cycles).toHaveLength(1);
  });

  describe('PromptRuntimeFacade boundary cases', () => {
    it('composes prompts without an executor and keeps cache updates skipped', () => {
      const debug = vi.fn();
      const { facade } = createPromptRuntimeFacade({
        getExecutor: () => null,
        debug,
      });
      const history: ChatMessage[] = [{ role: 'system', content: 'old prompt' }];

      facade.setBasePrompt('Base prompt');
      const eventIds = facade.syncSystemPrompt({ history, historyEventIds: [[]] });

      expect(history[0]?.content).toContain('Base prompt');
      expect(eventIds).toEqual([[]]);
      expect(debug).toHaveBeenCalledWith(
        'neko.agent.prompt.composed',
        expect.objectContaining({ textChars: expect.any(Number) }),
      );
    });

    it('does not inject a system message when history has no system entry', () => {
      const executor = { updateServiceOptions: vi.fn() };
      const { facade } = createPromptRuntimeFacade({
        getExecutor: () => executor as unknown as AgentExecutor,
      });
      const history: ChatMessage[] = [{ role: 'user', content: 'hello' }];
      const historyEventIds = [['event-user']];

      facade.setBasePrompt('Base prompt');
      const eventIds = facade.syncSystemPrompt({ history, historyEventIds });

      expect(history).toEqual([{ role: 'user', content: 'hello' }]);
      expect(eventIds).toBe(historyEventIds);
      expect(executor.updateServiceOptions).toHaveBeenCalled();
    });

    it('skips executor cache updates when composed sections are empty', () => {
      const executor = { updateServiceOptions: vi.fn() };
      const debug = vi.fn();
      const { facade } = createPromptRuntimeFacade({
        runId: null,
        getExecutor: () => executor as unknown as AgentExecutor,
        debug,
      });
      const history: ChatMessage[] = [{ role: 'system', content: 'old prompt' }];

      const eventIds = facade.syncSystemPrompt({ history, historyEventIds: [] });

      expect(history[0]?.content).toBe('');
      expect(eventIds[0]).toEqual([]);
      expect(executor.updateServiceOptions).not.toHaveBeenCalled();
      expect(debug).toHaveBeenCalledWith(
        'neko.agent.prompt.composed',
        expect.objectContaining({ sectionCount: 0, textChars: 0 }),
      );
    });
  });

  it('syncs prompt modules, composes system prompt, and refreshes executor prompt cache sections', () => {
    const composer = new SystemPromptComposer();
    const registry = new PromptModuleRegistry();
    const orchestrator = new ModuleOrchestrator(registry, composer, new PromptSectionCache());
    const artifactSchemaModule = new ArtifactSchemaModule();
    const validationGuidanceModule = new ValidationGuidanceModule();
    const memoryRecallModule = new MemoryRecallModule();
    const creativeVersionLogModule = new CreativeVersionLogModule();
    const subpackageFragmentsModule = new SubpackageFragmentsModule();
    const executor = {
      updateServiceOptions: vi.fn(),
    };
    const debug = vi.fn();
    const facade = new PromptRuntimeFacade({
      ports: {
        composer: {
          promptComposer: composer,
          promptModuleOrchestrator: orchestrator,
          promptContextProvider: () => ({
            runId: 'activity-prompt',
            stage: 'draft',
            locale: 'en',
            projectPath: '/workspace',
            activeSkillName: null,
            activeTools: [],
          }),
        },
        modules: {
          artifactSchemaModule,
          validationGuidanceModule,
          memoryRecallModule,
          creativeVersionLogModule,
          subpackageFragmentsModule,
        },
        executor: {
          getExecutor: () => executor as unknown as AgentExecutor,
          getCreativeVersionSummary: () => 'Version summary',
        },
        diagnostics: {
          debug,
        },
      },
    });
    const history: ChatMessage[] = [{ role: 'system', content: 'old prompt' }];

    facade.setBasePrompt('Base prompt');
    facade.setPromptFragments([{ id: 'fragment-1', content: 'Fragment prompt' }]);
    facade.setMemoryRecallContent('Memory prompt');
    facade.setValidationGuidanceContent('Guidance prompt');
    const nextEventIds = facade.syncSystemPrompt({ history, historyEventIds: [] });

    expect(history[0]?.content).toContain('Base prompt');
    expect(history[0]?.content).toContain('Creation document contract');
    expect(history[0]?.content).not.toContain('.neko/drafts');
    expect(history[0]?.content).toContain('Guidance prompt');
    expect(history[0]?.content).toContain('Memory prompt');
    expect(history[0]?.content).toContain('Version summary');
    expect(history[0]?.content).toContain('Fragment prompt');
    expect(nextEventIds[0]).toEqual([]);
    expect(executor.updateServiceOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPromptSections: expect.any(Array),
      }),
    );
    expect(debug).toHaveBeenCalledWith(
      'neko.agent.prompt.composed',
      expect.objectContaining({ sectionCount: expect.any(Number) }),
    );
  });
});

function createArtifactFacade(input: {
  readonly activeRun?: { readonly id: string; readonly startedAt?: number } | null;
  readonly readFile?: ((path: string) => Promise<string>) | null;
  readonly onWarn?: (message: string, data?: Record<string, unknown>) => void;
  readonly onPersist?: () => void;
  readonly bindArtifact?: (scopeId: string, binding: ArtifactScopeBinding) => void;
}): SessionArtifactFacade {
  const activeRun = input.activeRun ?? null;
  return new SessionArtifactFacade({
    ports: {
      session: {
        getConversationId: () => 'conv-1',
      },
      activity: {
        getActiveArtifactScope: () => activeRun,
        getArtifactScopeStartedAt: (scopeId) =>
          activeRun?.id === scopeId ? activeRun.startedAt : undefined,
        bindArtifact: input.bindArtifact ?? vi.fn(),
      },
      workspace: {
        getWorkspaceReadFile: () => input.readFile ?? null,
        isDisposed: () => false,
      },
      persistence: {
        onPersist: input.onPersist ?? vi.fn(),
        onWarn: input.onWarn,
      },
    },
  });
}

function createPromptRuntimeFacade(
  input: {
    readonly runId?: string | null;
    readonly stage?: IdcStage | null;
    readonly getExecutor?: () => AgentExecutor | null;
    readonly getCreativeVersionSummary?: () => string | null;
    readonly debug?: (message: string, data?: Record<string, unknown>) => void;
  } = {},
): {
  readonly facade: PromptRuntimeFacade;
  readonly composer: SystemPromptComposer;
} {
  const composer = new SystemPromptComposer();
  const registry = new PromptModuleRegistry();
  const orchestrator = new ModuleOrchestrator(registry, composer, new PromptSectionCache());
  const facade = new PromptRuntimeFacade({
    ports: {
      composer: {
        promptComposer: composer,
        promptModuleOrchestrator: orchestrator,
        promptContextProvider: () => ({
          runId: input.runId === undefined ? 'activity-prompt' : input.runId,
          stage: input.stage === undefined ? 'draft' : input.stage,
          locale: 'en',
          projectPath: '/workspace',
          activeSkillName: null,
          activeTools: [],
        }),
      },
      modules: {
        artifactSchemaModule: new ArtifactSchemaModule(),
        validationGuidanceModule: new ValidationGuidanceModule(),
        memoryRecallModule: new MemoryRecallModule(),
        creativeVersionLogModule: new CreativeVersionLogModule(),
        subpackageFragmentsModule: new SubpackageFragmentsModule(),
      },
      executor: {
        getExecutor: input.getExecutor ?? (() => null),
        getCreativeVersionSummary: input.getCreativeVersionSummary ?? (() => null),
      },
      diagnostics: {
        debug: input.debug ?? vi.fn(),
      },
    },
  });

  return { facade, composer };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class MemoryArtifactService implements IArtifactService {
  readonly writeMock = vi.fn();
  readonly writeDraftMock = vi.fn();
  readonly writePlanMock = vi.fn();
  readonly writeTaskMock = vi.fn();
  readonly ingestObservedArtifactMock = vi.fn();
  readonly getByRunIdMock = vi.fn();
  readonly listRunIdsMock = vi.fn();
  readonly listByRunIdMock = vi.fn();
  readonly getCreationIdByRunIdMock = vi.fn();
  readonly restore = vi.fn(async () =>
    Array.from(this._records.values()).flatMap((records) => [...records.values()]),
  );
  readonly flush = vi.fn(async () => {});
  readonly dispose = vi.fn(async () => {});

  private readonly _records = new Map<string, Map<AnyArtifactRecord['kind'], AnyArtifactRecord>>();
  private readonly _creationIdsByRun = new Map<string, string>();

  constructor(records: readonly AnyArtifactRecord[] = []) {
    for (const record of records) {
      this._remember(record);
    }
  }

  write(input: ArtifactWriteInput<'draft'>): Promise<ArtifactRecord<'draft'>>;
  write(input: ArtifactWriteInput<'plan'>): Promise<ArtifactRecord<'plan'>>;
  write(input: ArtifactWriteInput<'task'>): Promise<ArtifactRecord<'task'>>;
  async write(input: ArtifactWriteInput): Promise<AnyArtifactRecord> {
    this.writeMock(input);
    switch (input.kind) {
      case 'draft':
        return this.writeDraft(input.runId, input.value);
      case 'plan':
        return this.writePlan(input.runId, input.value);
      case 'task':
        return this.writeTask(input.runId, input.value);
    }
  }

  async writeDraft(runId: string, draft: Draft): Promise<ArtifactRecord<'draft'>> {
    this.writeDraftMock(runId, draft);
    return this._remember(
      createArtifactRecord(
        'draft',
        runId,
        draft,
        draft.updatedAt,
        this._creationIdForRun(runId, draft.id),
      ),
    );
  }

  async writePlan(runId: string, plan: ExecutionPlan): Promise<ArtifactRecord<'plan'>> {
    this.writePlanMock(runId, plan);
    return this._remember(
      createArtifactRecord(
        'plan',
        runId,
        plan,
        plan.updatedAt,
        this._creationIdForRun(runId, plan.draftId),
      ),
    );
  }

  async writeTask(runId: string, task: Task): Promise<ArtifactRecord<'task'>> {
    this.writeTaskMock(runId, task);
    return this._remember(
      createArtifactRecord(
        'task',
        runId,
        task,
        task.updatedAt,
        this._creationIdForRun(runId, task.id),
      ),
    );
  }

  ingestObservedArtifact(input: ArtifactObservedInput<'draft'>): ArtifactRecord<'draft'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'plan'>): ArtifactRecord<'plan'>;
  ingestObservedArtifact(input: ArtifactObservedInput<'task'>): ArtifactRecord<'task'>;
  ingestObservedArtifact(input: ArtifactObservedInput): AnyArtifactRecord {
    this.ingestObservedArtifactMock(input);
    const now = 200;
    switch (input.kind) {
      case 'draft':
        return this._remember(
          createArtifactRecord('draft', input.runId, createDraft('observed-draft', now), now),
        );
      case 'plan':
        return this._remember(
          createArtifactRecord('plan', input.runId, createPlan('observed-plan', now), now),
        );
      case 'task':
        return this._remember(
          createArtifactRecord('task', input.runId, createTask('observed-task', now), now),
        );
    }
  }

  getByRunId(runId: string, kind: 'draft'): ArtifactRecord<'draft'> | null;
  getByRunId(runId: string, kind: 'plan'): ArtifactRecord<'plan'> | null;
  getByRunId(runId: string, kind: 'task'): ArtifactRecord<'task'> | null;
  getByRunId(runId: string, kind: AnyArtifactRecord['kind']): AnyArtifactRecord | null {
    this.getByRunIdMock(runId, kind);
    return this._records.get(runId)?.get(kind) ?? null;
  }

  listRunIds(): readonly string[] {
    this.listRunIdsMock();
    return Array.from(this._records.keys());
  }

  listByRunId(runId: string): readonly AnyArtifactRecord[] {
    this.listByRunIdMock(runId);
    return Array.from(this._records.get(runId)?.values() ?? []);
  }

  getCreationIdByRunId(runId: string): string | null {
    this.getCreationIdByRunIdMock(runId);
    return this._creationIdsByRun.get(runId) ?? null;
  }

  private _remember<T extends AnyArtifactRecord>(record: T): T {
    const creationId = extractCreationId(record.path);
    if (creationId) {
      this._creationIdsByRun.set(record.runId, creationId);
    }
    const records = this._records.get(record.runId) ?? new Map();
    records.set(record.kind, record);
    this._records.set(record.runId, records);
    return record;
  }

  private _creationIdForRun(runId: string, seed: string): string {
    const existing = this._creationIdsByRun.get(runId);
    if (existing) {
      return existing;
    }
    const creationId = `creation-${seed}`;
    this._creationIdsByRun.set(runId, creationId);
    return creationId;
  }
}

function createTaskProjection(): ICreationTaskProjection & {
  syncTask: ReturnType<typeof vi.fn>;
  clearRun: ReturnType<typeof vi.fn>;
} {
  return {
    syncTask: vi.fn(async () => []),
    clearRun: vi.fn(async () => {}),
  };
}

function createArtifactRecord(
  kind: 'draft',
  runId: string,
  value: Draft,
  updatedAt: number,
  creationId?: string,
): ArtifactRecord<'draft'>;
function createArtifactRecord(
  kind: 'plan',
  runId: string,
  value: ExecutionPlan,
  updatedAt: number,
  creationId?: string,
): ArtifactRecord<'plan'>;
function createArtifactRecord(
  kind: 'task',
  runId: string,
  value: Task,
  updatedAt: number,
  creationId?: string,
): ArtifactRecord<'task'>;
function createArtifactRecord(
  kind: AnyArtifactRecord['kind'],
  runId: string,
  value: Draft | ExecutionPlan | Task,
  updatedAt: number,
  creationId?: string,
): AnyArtifactRecord {
  const artifactId = 'id' in value ? value.id : `${kind}-${runId}`;
  return {
    kind,
    runId,
    artifactId,
    path: `neko/creations/${creationId ?? `creation-${artifactId}`}/${creationFileName(kind)}`,
    updatedAt,
    content: artifactId,
    value,
  } as AnyArtifactRecord;
}

function creationFileName(kind: AnyArtifactRecord['kind']): string {
  switch (kind) {
    case 'draft':
      return 'brief.md';
    case 'plan':
      return 'plan.md';
    case 'task':
      return 'checklist.md';
  }
}

function extractCreationId(path: string): string | null {
  const match = /(?:^|\/)neko\/creations\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

function createArtifactWrittenEvent(
  kind: ExecutionArtifactWrittenEvent['kind'],
  runId: string,
): ExecutionArtifactWrittenEvent {
  return {
    type: 'execution.artifact.written',
    runId,
    kind,
    artifactId: `${kind}-observed`,
    path: `neko/creations/observed-creation/${creationFileName(kind)}`,
    at: 300,
  };
}

class TestFeedbackCoordinator implements AgentValidationCoordinator {
  private _nextCycle: AgentValidationCycle | null;
  readonly getBeforeThinkHooks = vi.fn(() => []);
  readonly observe = vi.fn();
  readonly getSignalHistory = vi.fn(() => []);
  readonly getDecisionHistory = vi.fn(() => []);
  readonly getActionHistory = vi.fn(() => []);
  readonly extractMemory = vi.fn(
    async (
      _input: AgentValidationMemoryExtractionInput,
    ): Promise<AgentValidationMemoryExtractionOutcome> => ({
      kind: 'skipped',
      timestamp: 100,
      sourceEventIds: [],
      reason: 'disabled',
    }),
  );
  readonly dispose = vi.fn();

  constructor(cycle: AgentValidationCycle | null) {
    this._nextCycle = cycle;
  }

  setNextCycle(cycle: AgentValidationCycle | null): void {
    this._nextCycle = cycle;
  }

  evaluatePending(_context?: AgentValidationEvaluationContext): AgentValidationCycle | null {
    return this._nextCycle;
  }
}

function createTestFeedbackCoordinator(cycle: AgentValidationCycle | null): TestFeedbackCoordinator {
  return new TestFeedbackCoordinator(cycle);
}

function createFeedbackCycle(): AgentValidationCycle {
  return {
    timestamp: 100,
    currentStage: 'apply',
    activeRunId: 'activity-feedback',
    signals: [],
    decisions: [
      {
        action: 'repair',
        signalKind: 'tool-failure',
        toolCallId: 'tool-1',
        toolName: 'WriteFile',
        error: 'failed',
        runId: 'activity-feedback',
      },
    ],
    actions: [
      {
        kind: 'set-guidance',
        guidance: '- Retry with a smaller edit.',
        signalKinds: ['tool-failure'],
      },
    ],
  };
}

function createControlPlane(): AgentCreativeProcessRecoveryPolicy {
  const creativeProcessRecoveryPolicy = {
    stageRegistry: {
      get: () => undefined,
      list: () => [],
      has: () => false,
    },
    artifactRegistry: {
      get: () => undefined,
      list: () => [],
      has: () => false,
      byStage: () => undefined,
    },
    advise: vi.fn((input) => ({
      input,
      createdAt: 101,
      guidance: {
        transitionAction: 'retry-stage',
        decisionAction: input.decision.action,
        fromStageId: 'apply',
        toStageId: 'apply',
        reason: 'retry after failed tool',
        requiresUserApproval: false,
      },
    })),
    getDecisionHistory: vi.fn(() => []),
  };
  return creativeProcessRecoveryPolicy;
}

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
