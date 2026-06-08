import { describe, expect, it, vi } from 'vitest';
import type {
  CharacterStateChange,
  ContinuityConstraint,
  CreativeEntityRef,
  PlotEvent,
  ShotImagePrepPlan,
} from '@neko/shared';
import {
  CHARACTER_STATE_CHANGE_KIND,
  COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
  CONTINUITY_CONSTRAINT_KIND,
  PLOT_EVENT_KIND,
} from '@neko/shared';
import {
  backfillBatchExecutionPlanFromSummary,
  createAssetIndexingBatchExecutionPlan,
  createComicAnimationSidecarRecord,
  createDefaultComicAnimationPerceptionFacets,
  createMentionResolverContinuityContext,
  createShotImagePrepBatchExecutionPlan,
  isIndexedRangeTaskStale,
  planComicAnimationIndexingTasks,
  queryStoryContinuitySnapshot,
  rebuildComicAnimationCacheFromSidecars,
  registerComicAnimationAsset,
  writeComicAnimationSidecarFirst,
} from '../comic-animation-indexing-runtime';

describe('comic animation indexing runtime', () => {
  it('registers assets immediately with pending range tasks', () => {
    const state = registerComicAnimationAsset({
      assetId: 'asset-page-1',
      sourceRef: sourceRef(),
      rangeKind: 'page',
      assetHash: 'hash-v1',
      now: '2026-06-08T00:00:00.000Z',
    });

    expect(state.status).toBe('pending');
    expect(state.tasks.map((task) => [task.task, task.status, task.sourceHash])).toEqual([
      ['ocr', 'pending', 'hash-v1'],
      ['panel-detection', 'pending', 'hash-v1'],
      ['reading-order', 'pending', 'hash-v1'],
    ]);
  });

  it('plans only pending or stale indexing tasks and reuses completed work', () => {
    const state = {
      ...registerComicAnimationAsset({ assetId: 'asset-page-1', sourceRef: sourceRef() }),
      tasks: [
        { taskId: 'ocr', task: 'ocr', status: 'complete' },
        { taskId: 'panel', task: 'panel-detection', status: 'stale' },
        { taskId: 'mask', task: 'speech-balloon-mask', status: 'pending' },
      ],
    } as const;

    const plan = planComicAnimationIndexingTasks({
      states: [state],
      supportedTasks: ['panel-detection'],
    });

    expect(plan.reusableStates).toEqual([]);
    expect(plan.scheduledTasks).toEqual([
      expect.objectContaining({ task: 'panel-detection', status: 'queued' }),
    ]);
    expect(plan.diagnostics).toEqual([
      expect.objectContaining({
        code: 'provider-unavailable',
        path: ['states', 'asset-page-1:asset', 'speech-balloon-mask'],
      }),
    ]);
    expect(isIndexedRangeTaskStale({ task: state.tasks[1]!, assetHash: 'hash-v2' })).toBe(true);
  });

  it('queries bounded story continuity snapshots and exposes read-only mention context', () => {
    const snapshot = queryStoryContinuitySnapshot(
      {
        events: [plotEvent('old', 1), plotEvent('current', 9), plotEvent('future', 12)],
        characterStates: [characterState('state-1', 8), characterState('state-2', 11)],
        constraints: [constraint('constraint-1')],
        unresolvedQuestions: ['Who has the key?'],
      },
      {
        queryId: 'query-1',
        storyPosition: { sceneId: 'scene-1', orderIndex: 10 },
        characterRefs: [characterRef],
        lookbackLimit: { maxEvents: 1, maxCharacterStates: 3, maxConstraints: 2 },
      },
    );
    const mentionContext = createMentionResolverContinuityContext(snapshot);

    expect(snapshot.events.map((event) => event.eventId)).toEqual(['current']);
    expect(snapshot.characterStates.map((state) => state.changeId)).toEqual(['state-1']);
    expect(snapshot.constraints).toHaveLength(1);
    expect(mentionContext).toMatchObject({
      candidateEntityRefs: [characterRef],
      readOnly: true,
    });
  });

  it('constructs asset-indexing and shot-image-prep batch plans with diagnostics', () => {
    const state = registerComicAnimationAsset({ assetId: 'asset-page-1', sourceRef: sourceRef() });
    const assetPlan = createAssetIndexingBatchExecutionPlan({
      planId: 'batch-index-1',
      states: [state],
      facets: createDefaultComicAnimationPerceptionFacets(),
      availableProviderIds: ['local.ocr'],
      currentDeviceTier: 'light',
      maxConcurrency: 2,
    });
    const prepPlan = createShotImagePrepBatchExecutionPlan({
      planId: 'batch-prep-1',
      plans: [shotPrepPlan()],
    });

    expect(assetPlan.items.map((item) => item.capabilityId)).toEqual([
      'perception.ocr',
      'perception.panel-detection',
      'perception.reading-order',
    ]);
    expect(assetPlan.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['provider-unavailable', 'cost-unknown']),
    );
    expect(prepPlan.items[0]).toMatchObject({
      capabilityId: 'shot-image-prep.transform-original',
      status: 'approved',
    });
  });

  it('backfills batch summaries without discarding partial outputs', () => {
    const plan = createShotImagePrepBatchExecutionPlan({
      planId: 'batch-prep-1',
      plans: [shotPrepPlan({ planId: 'prep-1' }), shotPrepPlan({ planId: 'prep-2' })],
    });

    const result = backfillBatchExecutionPlanFromSummary({
      plan,
      completedItemIds: ['prep-1'],
      failedItemIds: ['prep-2'],
      outputRefsByItemId: { 'prep-1': ['generated:prep-1:0'] },
    });

    expect(result.plan.status).toBe('partial');
    expect(result.plan.items).toEqual([
      expect.objectContaining({
        itemId: 'prep-1',
        status: 'succeeded',
        outputRefs: ['generated:prep-1:0'],
      }),
      expect.objectContaining({ itemId: 'prep-2', status: 'failed' }),
    ]);
    expect(result.summary.status).toBe('partial');
    expect(result.summary.metadata).toEqual(expect.objectContaining({ succeeded: 1, failed: 1 }));
  });

  it('writes sidecars before rebuilding cache projections and cache deletion keeps evidence', async () => {
    const record = createComicAnimationSidecarRecord({
      recordKind: 'semantic-evidence',
      id: 'asset-page-1/index',
      content: { assetId: 'asset-page-1' },
    });
    const write = vi.fn(async () => undefined);
    const rebuild = vi.fn(async () => undefined);
    const clearCache = vi.fn(async () => undefined);

    await writeComicAnimationSidecarFirst({
      sidecar: {
        read: async () => undefined,
        write,
        exists: async () => true,
      },
      projection: {
        rebuildFromSidecars: rebuild,
        clearCache,
      },
      record,
    });
    await clearCache();
    await rebuildComicAnimationCacheFromSidecars({
      sidecarRecords: [record],
      projection: {
        rebuildFromSidecars: rebuild,
      },
    });

    expect(record.path).toBe('${PROJECT}/.neko/semantic-index/asset-page-1-index.json');
    expect(write).toHaveBeenCalledBefore(rebuild);
    expect(clearCache).toHaveBeenCalled();
    expect(rebuild).toHaveBeenLastCalledWith([record]);
  });
});

const characterRef: CreativeEntityRef = {
  entityId: 'char-rin',
  entityKind: 'character',
};

function sourceRef() {
  return {
    kind: 'generated-asset',
    assetId: 'asset-page-1',
    range: { pageId: 'page-1' },
  } as const;
}

function plotEvent(eventId: string, orderIndex: number): PlotEvent {
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: PLOT_EVENT_KIND,
    eventId,
    summary: `event ${eventId}`,
    storyPosition: { sceneId: 'scene-1', orderIndex },
    orderIndex,
    sourceRef: sourceRef(),
    participantRefs: [characterRef],
  };
}

function characterState(changeId: string, orderIndex: number): CharacterStateChange {
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: CHARACTER_STATE_CHANGE_KIND,
    changeId,
    characterRef,
    dimension: 'location',
    after: 'front gate',
    storyPosition: { sceneId: 'scene-1', orderIndex },
    sourceRef: sourceRef(),
  };
}

function constraint(constraintId: string): ContinuityConstraint {
  return {
    schemaVersion: COMIC_ANIMATION_INDEXING_SCHEMA_VERSION,
    kind: CONTINUITY_CONSTRAINT_KIND,
    constraintId,
    type: 'blocking',
    message: 'Keep Rin at the gate.',
    entityRefs: [characterRef],
  };
}

function shotPrepPlan(overrides: Partial<ShotImagePrepPlan> = {}): ShotImagePrepPlan {
  return {
    schemaVersion: 1,
    kind: 'shot-image-prep-plan',
    planId: 'prep-1',
    sceneId: 'scene-1',
    shotId: 'shot-1',
    sourceMediaRefs: [
      {
        refId: 'panel-1',
        role: 'source',
        locator: { type: 'workspace-path', path: '${PROJECT}/comic/page-1.png' },
        mimeType: 'image/png',
      },
    ],
    imageStrategy: 'transform-original',
    operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
    status: 'approved',
    ...overrides,
  };
}
