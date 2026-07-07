import { describe, expect, it } from 'vitest';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  type CreativeAiDocumentRef,
  type CreativeAiRoutingDecision,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  type ExternalCreativeAiInvocation,
} from '@neko/shared/types/creative-ai-invocation';
import { createCreativeAiRunRuntime } from '../creative-ai-run-runtime';

const ASSOCIATION_KEY = 'neko-canvas:document:doc-1';

const documentRef: CreativeAiDocumentRef = {
  kind: 'nk-document',
  packageId: 'neko-canvas',
  documentId: 'doc-1',
  projectRelativePath: 'boards/intro.nkc',
};

const sourceRef: CreativeAiSourceRef = {
  kind: 'canvas-node',
  packageId: 'neko-canvas',
  id: 'node-1',
  documentRef,
  revision: 'source-rev-1',
};

const targetRef: CreativeAiTargetRef = {
  kind: 'canvas-field',
  packageId: 'neko-canvas',
  id: 'node-1#/data/prompt',
  documentRef,
  fieldPath: '/data/prompt',
  revision: 'target-rev-1',
};

const routingDecision: CreativeAiRoutingDecision = {
  conversationId: 'background-1',
  domain: 'external-creative-package',
  routingReason: 'recent-associated-conversation',
  associationKey: ASSOCIATION_KEY,
  sourcePackage: 'neko-canvas',
  conversationState: 'active',
  diagnostics: [],
};

function createRuntime() {
  let now = Date.parse('2026-07-07T00:00:00.000Z');
  const runtime = createCreativeAiRunRuntime({
    now: () => now,
    createRunId: ({ sequence }) => `run-${sequence}`,
    createWorkItemId: ({ sequence }) => `work-${sequence}`,
  });
  return {
    runtime,
    advance(ms: number) {
      now += ms;
    },
  };
}

function externalInvocation(
  overrides: Partial<ExternalCreativeAiInvocation> = {},
): ExternalCreativeAiInvocation {
  return {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    domain: 'external-creative-package',
    invocationId: 'invoke-1',
    sourcePackage: 'neko-canvas',
    documentRef,
    sourceRef,
    targetRef,
    intent: 'Improve the node prompt.',
    mode: 'edit',
    writeback: { kind: 'mutating', requiresRevisionMatch: true },
    documentRevision: 'doc-rev-1',
    targetRevision: 'target-rev-1',
    routing: { associationKey: ASSOCIATION_KEY },
    idempotencyKey: 'neko-canvas:doc-1:node-1:prompt:edit:doc-rev-1',
    ...overrides,
  };
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function flushAsyncQueue(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('creative AI run runtime', () => {
  it('creates immutable run snapshots and returns existing state for duplicate idempotency', () => {
    const { runtime } = createRuntime();

    const created = runtime.acceptInvocation({
      invocation: externalInvocation(),
      routingDecision,
      modelSnapshot: {
        providerId: 'openai',
        modelId: 'gpt-image-1',
        capabilityId: 'canvas.prompt.edit',
        capabilityRevision: 'cap-rev-1',
      },
    });

    expect(created.status).toBe('created');
    if (created.status !== 'created') return;
    expect(created.snapshot).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        conversationId: 'background-1',
        associationKey: ASSOCIATION_KEY,
        routingReason: 'recent-associated-conversation',
        sourceRef,
        targetRef,
        documentRevision: 'doc-rev-1',
        targetRevision: 'target-rev-1',
        idempotencyKey: 'neko-canvas:doc-1:node-1:prompt:edit:doc-rev-1',
        status: 'accepted',
      }),
    );
    expect(created.events).toEqual([
      expect.objectContaining({
        type: 'run-started',
        runId: 'run-1',
        conversationId: 'background-1',
      }),
    ]);

    const duplicate = runtime.acceptInvocation({
      invocation: externalInvocation({ invocationId: 'invoke-duplicate' }),
      routingDecision,
    });

    expect(duplicate.status).toBe('existing');
    if (duplicate.status !== 'existing') return;
    expect(duplicate.snapshot.runId).toBe('run-1');
    expect(duplicate.events).toHaveLength(0);
    expect(runtime.getEvents().filter((event) => event.type === 'run-started')).toHaveLength(1);
  });

  it('keeps main Agent turns serialized while background work items run concurrently', async () => {
    const { runtime } = createRuntime();
    const accepted = runtime.acceptInvocation({
      invocation: externalInvocation(),
      routingDecision,
    });
    expect(accepted.status).toBe('created');
    if (accepted.status !== 'created') return;

    const order: string[] = [];
    const releaseMain = deferred();
    const secondStarted = deferred();

    const firstTurn = runtime.enqueueMainTurn('background-1', async () => {
      order.push('main-1:start');
      await releaseMain.promise;
      order.push('main-1:end');
    });
    const secondTurn = runtime.enqueueMainTurn('background-1', () => {
      order.push('main-2:start');
      secondStarted.resolve();
    });
    await flushAsyncQueue();
    expect(order).toEqual(['main-1:start']);

    const releaseBackgroundA = deferred();
    const releaseBackgroundB = deferred();
    runtime.startBackgroundWorkItem({
      runId: 'run-1',
      targetRef,
      execute: async () => {
        order.push('background-a:start');
        await releaseBackgroundA.promise;
        order.push('background-a:end');
      },
    });
    runtime.startBackgroundWorkItem({
      runId: 'run-1',
      targetRef: { ...targetRef, id: 'node-2#/data/prompt' },
      execute: async () => {
        order.push('background-b:start');
        await releaseBackgroundB.promise;
        order.push('background-b:end');
      },
    });
    await flushAsyncQueue();

    expect(order).toEqual(['main-1:start', 'background-a:start', 'background-b:start']);
    expect(runtime.getConversationRunIds('background-1')).toEqual(['run-1']);
    expect(runtime.getRunSnapshot('run-1')?.workItems).toHaveLength(2);

    releaseBackgroundA.resolve();
    releaseBackgroundB.resolve();
    await flushAsyncQueue();
    releaseMain.resolve();
    await firstTurn;
    await secondStarted.promise;
    await secondTurn;

    expect(order).toEqual([
      'main-1:start',
      'background-a:start',
      'background-b:start',
      'background-a:end',
      'background-b:end',
      'main-1:end',
      'main-2:start',
    ]);
  });

  it('projects work item lifecycle events for progress, generated output, stale target, failed apply, and cancellation', () => {
    const { runtime } = createRuntime();
    const accepted = runtime.acceptInvocation({
      invocation: externalInvocation(),
      routingDecision,
    });
    expect(accepted.status).toBe('created');
    if (accepted.status !== 'created') return;

    const progressItem = runtime.startBackgroundWorkItem({ runId: 'run-1', targetRef });
    runtime.updateWorkItemProgress('run-1', progressItem.workItemId);
    runtime.markGeneratedObservation('run-1', progressItem.workItemId);
    runtime.completeWorkItem('run-1', progressItem.workItemId);

    const staleItem = runtime.startBackgroundWorkItem({ runId: 'run-1', targetRef });
    runtime.markWorkItemStale('run-1', staleItem.workItemId, [
      {
        severity: 'error',
        code: 'creative-ai-target-revision-conflict',
        message: 'Target revision changed.',
        target: 'targetRef',
      },
    ]);

    const applyItem = runtime.startBackgroundWorkItem({ runId: 'run-1', targetRef });
    runtime.failWorkItemApply('run-1', applyItem.workItemId);

    const cancelItem = runtime.startBackgroundWorkItem({ runId: 'run-1', targetRef });
    runtime.cancelWorkItem('run-1', cancelItem.workItemId);

    expect(runtime.getEvents().map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'work-item-started',
        'work-item-progress',
        'work-item-generated-observation',
        'work-item-completed',
        'work-item-stale-target',
        'work-item-apply-failed',
        'work-item-cancelled',
      ]),
    );
    expect(runtime.getRunSnapshot('run-1')?.workItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ workItemId: staleItem.workItemId, status: 'stale-target' }),
        expect.objectContaining({ workItemId: applyItem.workItemId, status: 'apply-failed' }),
        expect.objectContaining({ workItemId: cancelItem.workItemId, status: 'cancelled' }),
      ]),
    );
  });

  it('projects SubAgent progress into the parent run without creating another conversation', () => {
    const { runtime } = createRuntime();
    const accepted = runtime.acceptInvocation({
      invocation: externalInvocation(),
      routingDecision,
    });
    expect(accepted.status).toBe('created');
    if (accepted.status !== 'created') return;

    const event = runtime.projectSubAgentEvent({
      runId: 'run-1',
      parentWorkItemId: 'work-parent',
      event: {
        type: 'progress',
        subAgentId: 'subagent-1',
        parentAgentId: 'agent-main',
        conversationId: 'background-1',
        data: {
          status: 'running',
          progress: 'checking target refs',
          runMode: 'background',
        },
        timestamp: Date.parse('2026-07-07T00:00:01.000Z'),
      },
    });

    expect(event).toEqual(
      expect.objectContaining({
        type: 'work-item-progress',
        source: 'subagent',
        subAgentId: 'subagent-1',
        conversationId: 'background-1',
        runId: 'run-1',
        workItemId: 'subagent-1',
      }),
    );
    expect(runtime.getConversationRunIds('background-1')).toEqual(['run-1']);
    expect(runtime.getRunSnapshot('run-1')?.workItems).toEqual([
      expect.objectContaining({
        workItemId: 'subagent-1',
        parentWorkItemId: 'work-parent',
        status: 'running',
      }),
    ]);
  });

  it('cancels active work items at run granularity', () => {
    const { runtime } = createRuntime();
    const accepted = runtime.acceptInvocation({
      invocation: externalInvocation(),
      routingDecision,
    });
    expect(accepted.status).toBe('created');
    if (accepted.status !== 'created') return;

    runtime.startBackgroundWorkItem({ runId: 'run-1', targetRef });
    runtime.startBackgroundWorkItem({ runId: 'run-1', targetRef: { ...targetRef, id: 'node-2' } });

    const snapshot = runtime.cancelRun('run-1', [
      {
        severity: 'warning',
        code: 'creative-ai-run-cancelled-by-user',
        message: 'User cancelled run.',
      },
    ]);

    expect(snapshot.status).toBe('cancelled');
    expect(snapshot.workItems).toEqual([
      expect.objectContaining({ workItemId: 'work-1', status: 'cancelled' }),
      expect.objectContaining({ workItemId: 'work-2', status: 'cancelled' }),
    ]);
    expect(runtime.getEvents()).toEqual([
      expect.objectContaining({ type: 'run-started' }),
      expect.objectContaining({ type: 'work-item-started', workItemId: 'work-1' }),
      expect.objectContaining({ type: 'work-item-started', workItemId: 'work-2' }),
      expect.objectContaining({ type: 'run-cancelled', runId: 'run-1' }),
    ]);
  });
});
