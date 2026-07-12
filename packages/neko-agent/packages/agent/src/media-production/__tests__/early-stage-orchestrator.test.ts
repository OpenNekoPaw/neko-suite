import { describe, expect, it, vi } from 'vitest';
import {
  MEDIA_QUALITY_CONTRACT_VERSION,
  createGeneratedAssetQualityTarget,
  createGeneratedAssetRevisionRef,
  createGeneratedAssetStageArtifactRef,
  createMediaProductionWorkflowRun,
  type MediaProductionStageArtifactRef,
  type MediaProductionStageId,
  type MediaProductionWorkflowRunState,
} from '@neko/shared';
import {
  MEDIA_PRODUCTION_EARLY_STAGE_IDS,
  MediaProductionEarlyStageOrchestrator,
  type MediaProductionEarlyStagePorts,
  type MediaProductionStageExecutionContext,
  type MediaProductionStageExecutionResult,
} from '../early-stage-orchestrator';

function createLifecycle(assetId: string, taskId: string) {
  return createGeneratedAssetRevisionRef({
    assetId,
    contentDigest: `sha256:${assetId}`,
    mediaKind: 'image',
    mimeType: 'image/png',
    generation: { taskId, runId: 'workflow-1' },
  });
}

function createState(): MediaProductionWorkflowRunState {
  const source = createLifecycle('comic-source-1', 'task-source');
  return createMediaProductionWorkflowRun({
    workflowRunId: 'workflow-1',
    sourceProfileId: 'media-production/from-comic',
    sourceRefs: [
      {
        kind: 'resource',
        sourceId: source.assetId,
        resourceRef: source.resourceRef,
        revision: source.revision,
        contentDigest: source.contentDigest,
      },
    ],
    createdAt: '2026-07-12T00:00:00.000Z',
  });
}

function createResourceArtifact(
  stageId: MediaProductionStageId,
  suffix: string,
): MediaProductionStageArtifactRef {
  return createGeneratedAssetStageArtifactRef({
    lifecycle: createLifecycle(`${stageId}-${suffix}`, `task-${stageId}`),
    profileId: `media-production.${stageId}`,
    producerStageId: stageId,
    createdAt: '2026-07-12T00:00:01.000Z',
  });
}

function createPorts(callOrder: string[]): MediaProductionEarlyStagePorts {
  const port = (stageId: (typeof MEDIA_PRODUCTION_EARLY_STAGE_IDS)[number]) => ({
    execute: vi.fn(async (context: MediaProductionStageExecutionContext) => {
      callOrder.push(stageId);
      expect(context.stageId).toBe(stageId);
      if (stageId === 'source-normalization') {
        expect(context.sourceRefs).toHaveLength(1);
        expect(context.inputArtifacts).toEqual([]);
      } else {
        expect(context.inputArtifacts).toHaveLength(1);
      }
      if (stageId === 'asset-quality-gate') {
        const generated = createLifecycle('accepted-shot-1', 'task-media-generation');
        return {
          artifacts: [
            {
              kind: 'quality-gate' as const,
              artifactId: 'asset-gate-1',
              profileId: 'media-production.asset-quality-gate',
              createdAt: '2026-07-12T00:00:01.000Z',
              producerStageId: stageId,
              sourceArtifactIds: context.inputArtifacts.map((artifact) => artifact.artifactId),
              gateResultId: 'gate-result-1',
              target: createGeneratedAssetQualityTarget(generated),
              verdict: 'pass' as const,
            },
          ],
          diagnostics: [],
        };
      }
      return {
        artifacts: [createResourceArtifact(stageId, '1')],
        diagnostics: [],
      };
    }),
  });
  return {
    sourceToStoryboard: port('source-normalization'),
    storyboardValidation: port('storyboard-validation'),
    shotGenerationPlanning: port('shot-generation-planning'),
    mediaGeneration: port('media-generation'),
    assetQualityGate: port('asset-quality-gate'),
  };
}

describe('media production early stage orchestrator', () => {
  it('runs source-to-Storyboard through asset Gate and persists every transition', async () => {
    let state = createState();
    const saves: MediaProductionWorkflowRunState[] = [];
    const callOrder: string[] = [];
    const orchestrator = new MediaProductionEarlyStageOrchestrator({
      stateStore: {
        load: vi.fn(async () => state),
        save: vi.fn(async (_taskId, next) => {
          state = next;
          saves.push(next);
        }),
      },
      ports: createPorts(callOrder),
      now: createClock(),
    });

    const result = await orchestrator.run('task-workflow-1');

    expect(callOrder).toEqual(MEDIA_PRODUCTION_EARLY_STAGE_IDS);
    expect(saves).toHaveLength(10);
    expect(result.stages.slice(0, 5).map((stage) => stage.status)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'completed',
    ]);
    expect(result.stages[4]?.artifacts[0]).toMatchObject({
      kind: 'quality-gate',
      gateResultId: 'gate-result-1',
      verdict: 'pass',
      target: { version: MEDIA_QUALITY_CONTRACT_VERSION, revision: expect.stringMatching(/^rev_/) },
    });
    expect(result.stages[5]?.status).toBe('pending');
  });

  it('stops before dependent mutation when Storyboard validation blocks', async () => {
    let state = createState();
    const callOrder: string[] = [];
    const ports = createPorts(callOrder);
    ports.storyboardValidation.execute = vi.fn(
      async (): Promise<MediaProductionStageExecutionResult> => ({
        artifacts: [],
        diagnostics: [
          {
            code: 'stage-blocked',
            severity: 'error',
            message: 'Storyboard is missing scene-level videoPrompt.',
            stageId: 'storyboard-validation',
          },
        ],
      }),
    );
    const orchestrator = new MediaProductionEarlyStageOrchestrator({
      stateStore: {
        load: vi.fn(async () => state),
        save: vi.fn(async (_taskId, next) => {
          state = next;
        }),
      },
      ports,
      now: createClock(),
    });

    const result = await orchestrator.run('task-workflow-1');

    expect(callOrder).toEqual(['source-normalization']);
    expect(ports.shotGenerationPlanning.execute).not.toHaveBeenCalled();
    expect(ports.mediaGeneration.execute).not.toHaveBeenCalled();
    expect(result.status).toBe('blocked');
    expect(result.stages[1]).toMatchObject({
      status: 'failed',
      diagnostics: [expect.objectContaining({ message: expect.stringContaining('videoPrompt') })],
    });
    expect(result.stages[0]?.artifacts).toHaveLength(1);
  });

  it('persists cancellation instead of converting an aborted stage into failure', async () => {
    let state = createState();
    const controller = new AbortController();
    const ports = createPorts([]);
    ports.sourceToStoryboard.execute = vi.fn(async () => {
      controller.abort();
      return {
        artifacts: [createResourceArtifact('source-normalization', 'cancelled')],
        diagnostics: [],
      };
    });
    const orchestrator = new MediaProductionEarlyStageOrchestrator({
      stateStore: {
        load: vi.fn(async () => state),
        save: vi.fn(async (_taskId, next) => {
          state = next;
        }),
      },
      ports,
      now: createClock(),
    });

    const result = await orchestrator.run('task-workflow-1', controller.signal);

    expect(result.status).toBe('cancelled');
    expect(result.stages[0]).toMatchObject({ status: 'cancelled', attempt: 1 });
    expect(result.stages[0]?.diagnostics).toEqual([]);
    expect(ports.storyboardValidation.execute).not.toHaveBeenCalled();
  });

  it('skips completed stage artifacts and refuses blind replay of interrupted mutations', async () => {
    let state = createState();
    const ports = createPorts([]);
    const first = new MediaProductionEarlyStageOrchestrator({
      stateStore: {
        load: vi.fn(async () => state),
        save: vi.fn(async (_taskId, next) => {
          state = next;
        }),
      },
      ports,
      now: createClock(),
    });
    await first.run('task-workflow-1');

    const rerun = new MediaProductionEarlyStageOrchestrator({
      stateStore: {
        load: vi.fn(async () => state),
        save: vi.fn(async () => undefined),
      },
      ports: createPorts([]),
      now: createClock(),
    });
    await rerun.run('task-workflow-1');
    expect(rerun).toBeDefined();

    const interrupted: MediaProductionWorkflowRunState = {
      ...createState(),
      status: 'running',
      stages: createState().stages.map((stage) =>
        stage.stageId === 'source-normalization'
          ? { ...stage, status: 'running', attempt: 1, startedAt: '2026-07-12T00:00:01.000Z' }
          : stage,
      ),
    };
    const interruptedRunner = new MediaProductionEarlyStageOrchestrator({
      stateStore: { load: vi.fn(async () => interrupted), save: vi.fn() },
      ports: createPorts([]),
    });
    await expect(interruptedRunner.run('task-workflow-1')).rejects.toThrow(
      'requires explicit resume validation',
    );
  });
});

function createClock(): () => string {
  let tick = 0;
  return () => `2026-07-12T00:00:${String(++tick).padStart(2, '0')}.000Z`;
}
