import { describe, expect, it, vi } from 'vitest';
import {
  createGeneratedAssetRevisionRef,
  createMediaProductionWorkflowRun,
  startMediaProductionStage,
  type Task,
  type TaskRunScope,
} from '@neko/shared';
import {
  MEDIA_PRODUCTION_WORKFLOW_STATE_OUTPUT_KEY,
  TaskBackedMediaProductionWorkflowStateStore,
  createMediaProductionWorkflowTaskInput,
  readMediaProductionWorkflowTaskState,
} from '../media-production-workflow-state';

const CREATED_AT = '2026-07-12T00:00:00.000Z';

function createSourceRef() {
  const lifecycle = createGeneratedAssetRevisionRef({
    assetId: 'comic-source-1',
    contentDigest: 'sha256:comic-source',
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId: 'task-import-source' },
  });
  return {
    kind: 'resource' as const,
    sourceId: 'comic-source-1',
    resourceRef: lifecycle.resourceRef,
    revision: lifecycle.revision,
    contentDigest: lifecycle.contentDigest,
  };
}

function createState() {
  return createMediaProductionWorkflowRun({
    workflowRunId: 'workflow-1',
    sourceProfileId: 'media-production/from-comic',
    sourceRefs: [createSourceRef()],
    createdAt: CREATED_AT,
  });
}

function createTask(state = createState()): Task {
  const input = createMediaProductionWorkflowTaskInput({
    state,
    ownerConversationId: 'conversation-1',
    ownerRunId: 'agent-run-1',
    ownerRunStartedAt: 100,
  });
  return {
    scope: taskScope(),
    id: 'task-workflow-1',
    type: 'workflow',
    status: 'running',
    input,
    lifecycle: {
      ...input.lifecycle,
      runMode: 'background',
      costPhase: 'idle',
      interruptPolicy: 'detach-and-continue',
      recoverPolicy: 'snapshot-only',
    },
    progress: 0,
    createdAt: 100,
    updatedAt: 100,
  };
}

describe('task-backed media production workflow state', () => {
  it('uses existing Agent task lifecycle with snapshot recovery instead of runtime handles', () => {
    const input = createMediaProductionWorkflowTaskInput({
      state: createState(),
      ownerConversationId: 'conversation-1',
      ownerRunId: 'agent-run-1',
    });

    expect(input).toMatchObject({
      type: 'workflow',
      payload: {
        kind: 'media-production-workflow',
        workflowRunId: 'workflow-1',
      },
      lifecycle: {
        runMode: 'background',
        interruptPolicy: 'detach-and-continue',
        recoverPolicy: 'snapshot-only',
      },
    });
    expect(JSON.stringify(input)).not.toMatch(/providerTask|engine-session|webview|cachePath/);
  });

  it('persists and reloads stage state through task output data', async () => {
    let task = createTask();
    const port = {
      get: vi.fn(async () => task),
      updateOutputData: vi.fn(async (_scope: TaskRunScope, data: Record<string, unknown>) => {
        task = {
          ...task,
          output: { data: { ...((task.output?.data as object | undefined) ?? {}), ...data } },
        };
        return true;
      }),
    };
    const store = new TaskBackedMediaProductionWorkflowStateStore(port);
    const running = startMediaProductionStage({
      state: await store.load(task.scope),
      stageId: 'source-normalization',
      startedAt: '2026-07-12T00:00:01.000Z',
    });

    await store.save(task.scope, running);

    expect(port.updateOutputData).toHaveBeenCalledWith(task.scope, {
      [MEDIA_PRODUCTION_WORKFLOW_STATE_OUTPUT_KEY]: running,
    });
    expect(await store.load(task.scope)).toEqual(running);
    expect(readMediaProductionWorkflowTaskState(JSON.parse(JSON.stringify(task)) as Task)).toEqual(
      running,
    );
  });

  it('fails visibly for a non-workflow task or mismatched run identity', async () => {
    const task = createTask();
    const port = {
      get: vi.fn(async () => ({ ...task, type: 'custom' as const })),
      updateOutputData: vi.fn(async () => true),
    };
    const store = new TaskBackedMediaProductionWorkflowStateStore(port);

    await expect(store.load(task.scope)).rejects.toThrow('is not a media production workflow task');
    await expect(
      store.save(task.scope, { ...createState(), workflowRunId: 'workflow-other' }),
    ).rejects.toThrow('is not a media production workflow task');
  });
});

function taskScope(): TaskRunScope {
  return {
    conversationId: 'conversation-1',
    runId: 'agent-run-1',
    parentRunId: 'agent-run-1',
    childRunId: 'task-workflow-1',
    childKind: 'task',
  };
}
