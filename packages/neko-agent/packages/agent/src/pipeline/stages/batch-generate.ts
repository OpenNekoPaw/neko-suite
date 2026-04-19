/**
 * BatchGenerate Stage — Parallel media generation for all scenes or shots
 *
 * Submits generation tasks for each scene (or shot in shot-first mode)
 * and waits for all to complete. Uses TaskManager's concurrency control.
 * Failed items are tracked for downstream handling.
 */

import type {
  IParallelStage,
  PipelineContext,
  PipelineReferenceChainEntry,
  ParallelTask,
  ParallelTaskResult,
  StoryboardScene,
} from '../types';

/** Dependency: media generation service */
export interface IMediaGenerator {
  /** Generate video/image for a scene/shot, returns local file path */
  generate(
    prompt: string,
    options: MediaGenerateOptions,
  ): Promise<{ path: string; duration?: number }>;
}

export interface MediaGenerateOptions {
  type?: 'image' | 'video';
  duration?: number;
  resolution?: string;
  style?: string;
  aspectRatio?: string;
  /**
   * Phase 5 reference chain — ordered list of *prior shot ids* whose
   * generated output the caller should thread in as additional reference
   * images.  Kept alongside `referenceImagePaths` so adapters that want
   * the raw ids (for custom resolution, logging, or telemetry) still have
   * them.  The list is always ordered anchor-first, then previous shots
   * in descending recency.  See docs/architecture/creative-consistency.md §4.
   */
  referenceShotIds?: readonly string[];
  /**
   * Phase 5.4 — resolved reference-image paths aligned with
   * `referenceShotIds`.  Pre-resolved by the batch-generate stage when
   * a `resolveReferencePath` resolver is supplied.  Undefined entries
   * from the resolver are dropped; the resulting list can be shorter
   * than (or absent from) `referenceShotIds`.
   *
   * When present, adapters should feed this list into
   * `MediaGenerationService.generateImage / generateVideo` as
   * `referenceImageUrl` (first) + `ipAdapterRefs` / `referenceImages`
   * (rest).
   */
  referenceImagePaths?: readonly string[];
}

export interface BatchGenerateStageDeps {
  mediaGenerator: IMediaGenerator;
  /**
   * Optional resolver that maps a reference `shotId` to the local path
   * of its generated asset.  Called once per entry in the chain at
   * task-creation time; entries that resolve to `undefined` are dropped
   * so the adapter never sees dangling ids.
   *
   * Providing this hook is what turns Phase 5.3's shot-id threading
   * into Phase 5.4's actual reference-image payload.  Leave it unset
   * during tests to retain the id-only behaviour.
   */
  resolveReferencePath?: (shotId: string, ctx: PipelineContext) => string | undefined;
}

export function createBatchGenerateStage(deps: BatchGenerateStageDeps): IParallelStage {
  return {
    name: 'batchGenerate',
    type: 'parallel',
    gate: 'auto',

    // Not used directly for parallel stages — tasks() + merge() are used instead
    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      return ctx;
    },

    tasks(ctx: PipelineContext): ParallelTask[] {
      const scenes = ctx.scenes;
      if (!scenes || scenes.length === 0) {
        return [];
      }

      if (ctx.generationUnit === 'shot') {
        return buildShotTasks(deps, ctx, scenes);
      }

      return buildSceneTasks(deps, ctx, scenes);
    },

    merge(ctx: PipelineContext, results: ParallelTaskResult[]): PipelineContext {
      if (ctx.generationUnit === 'shot') {
        return mergeShotResults(ctx, results);
      }
      return mergeSceneResults(ctx, results);
    },
  };
}

function buildSceneTasks(
  deps: BatchGenerateStageDeps,
  ctx: PipelineContext,
  scenes: StoryboardScene[],
): ParallelTask[] {
  const stageParams = ctx.stageParams?.['batchGenerate'] ?? {};

  return scenes.map((scene: StoryboardScene) => ({
    id: `scene-${scene.index}`,
    name: `Generate scene ${scene.index}: ${scene.heading}`,
    async execute(): Promise<ParallelTaskResult> {
      try {
        const result = await deps.mediaGenerator.generate(scene.suggestedPrompt, {
          type: (stageParams['type'] as 'image' | 'video') ?? 'video',
          duration: scene.estimatedDuration,
          resolution: (ctx.resolution as string) ?? (stageParams['resolution'] as string),
          style: ctx.globalStyle ?? (stageParams['style'] as string),
          aspectRatio: ctx.aspectRatio ?? (stageParams['aspectRatio'] as string),
        });
        return { id: `scene-${scene.index}`, success: true, data: result };
      } catch (error) {
        return {
          id: `scene-${scene.index}`,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  }));
}

function buildShotTasks(
  deps: BatchGenerateStageDeps,
  ctx: PipelineContext,
  scenes: StoryboardScene[],
): ParallelTask[] {
  const stageParams = ctx.stageParams?.['batchGenerate'] ?? {};
  const tasks: ParallelTask[] = [];

  for (const scene of scenes) {
    const shots = scene.shotPlans;
    if (!shots || shots.length === 0) {
      // Fall back to scene-level task when no shot plans
      tasks.push({
        id: `scene-${scene.index}`,
        name: `Generate scene ${scene.index}: ${scene.heading}`,
        async execute(): Promise<ParallelTaskResult> {
          try {
            const result = await deps.mediaGenerator.generate(scene.suggestedPrompt, {
              type: (stageParams['type'] as 'image' | 'video') ?? 'video',
              duration: scene.estimatedDuration,
              resolution: (ctx.resolution as string) ?? (stageParams['resolution'] as string),
              style: ctx.globalStyle ?? (stageParams['style'] as string),
              aspectRatio: ctx.aspectRatio ?? (stageParams['aspectRatio'] as string),
            });
            return { id: `scene-${scene.index}`, success: true, data: result };
          } catch (error) {
            return {
              id: `scene-${scene.index}`,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      });
      continue;
    }

    for (let j = 0; j < shots.length; j++) {
      const shot = shots[j]!;
      const taskId = `scene-${scene.index}-shot-${j}`;
      const prompt =
        (shot as { suggestedPrompt?: string }).suggestedPrompt ?? scene.suggestedPrompt;
      // Look up any reference-chain entry matching this shot — when
      // PlanBuilder's shot ids align with the pipeline's task ids the
      // chain is threaded through; otherwise this is just undefined.
      const shotIdCandidates = [
        taskId,
        (shot as { id?: string }).id,
        (shot as { shotId?: string }).shotId,
      ].filter((v): v is string => typeof v === 'string' && v.length > 0);
      const referenceShotIds = pickReferenceShotIds(ctx.referenceChain, shotIdCandidates);
      const referenceImagePaths = resolveReferencePaths(
        referenceShotIds,
        deps.resolveReferencePath,
        ctx,
      );

      tasks.push({
        id: taskId,
        name: `Generate scene ${scene.index} shot ${j + 1}: ${shot.visualDescription?.slice(0, 50) ?? ''}`,
        async execute(): Promise<ParallelTaskResult> {
          try {
            const result = await deps.mediaGenerator.generate(prompt, {
              type: (stageParams['type'] as 'image' | 'video') ?? 'video',
              duration: shot.duration ?? 3,
              resolution: (ctx.resolution as string) ?? (stageParams['resolution'] as string),
              style: ctx.globalStyle ?? (stageParams['style'] as string),
              aspectRatio: ctx.aspectRatio ?? (stageParams['aspectRatio'] as string),
              ...(referenceShotIds !== undefined && { referenceShotIds }),
              ...(referenceImagePaths !== undefined && { referenceImagePaths }),
            });
            return { id: taskId, success: true, data: result };
          } catch (error) {
            return {
              id: taskId,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      });
    }
  }

  return tasks;
}

/**
 * Find the first reference-chain entry whose `shotId` matches one of the
 * candidate ids for the current task.  Returns the shots referenced by
 * that entry (or undefined if no match is found / the chain is empty).
 *
 * Preference: earlier candidates beat later ones so the pipeline task id
 * is tried before the raw shot id from the story plan.  Within entries
 * for the same shot, priority goes to the 'character' slot (the most
 * important chain for drift prevention).
 */
/**
 * Map a list of reference shot ids to concrete file paths using the
 * caller-supplied resolver.  Unresolvable ids are dropped (logged on
 * warning would require a logger injection — skip for now and let the
 * adapter surface its own warnings when a chain unexpectedly collapses).
 *
 * Returns `undefined` when nothing was resolved so the task spread
 * omits the field entirely — keeping the generator call identical to
 * pre-chain behaviour.
 */
function resolveReferencePaths(
  shotIds: readonly string[] | undefined,
  resolver: ((shotId: string, ctx: PipelineContext) => string | undefined) | undefined,
  ctx: PipelineContext,
): readonly string[] | undefined {
  if (!shotIds || shotIds.length === 0 || !resolver) return undefined;
  const resolved: string[] = [];
  for (const id of shotIds) {
    const path = resolver(id, ctx);
    if (typeof path === 'string' && path.length > 0) resolved.push(path);
  }
  return resolved.length > 0 ? resolved : undefined;
}

function pickReferenceShotIds(
  chain: readonly PipelineReferenceChainEntry[] | undefined,
  shotIdCandidates: readonly string[],
): readonly string[] | undefined {
  if (!chain || chain.length === 0 || shotIdCandidates.length === 0) return undefined;
  const slotPriority: Record<PipelineReferenceChainEntry['slot'], number> = {
    character: 0,
    scene: 1,
    prop: 2,
    action: 3,
    style: 4,
  };
  const candidateSet = new Set(shotIdCandidates);
  const matches = chain.filter((e) => candidateSet.has(e.shotId));
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => slotPriority[a.slot] - slotPriority[b.slot]);
  return matches[0]?.references;
}

function mergeSceneResults(ctx: PipelineContext, results: ParallelTaskResult[]): PipelineContext {
  const generatedPaths: string[] = [];
  const failedScenes: number[] = [];
  const taskIds: string[] = [];

  for (const result of results) {
    taskIds.push(result.id);

    if (result.success && result.data) {
      const data = result.data as { path: string };
      generatedPaths.push(data.path);
    } else {
      const index = parseInt(result.id.replace('scene-', ''), 10);
      if (!isNaN(index)) {
        failedScenes.push(index);
      }
      generatedPaths.push('');
    }
  }

  return {
    ...ctx,
    taskIds,
    generatedPaths,
    failedScenes: failedScenes.length > 0 ? failedScenes : undefined,
  };
}

function mergeShotResults(ctx: PipelineContext, results: ParallelTaskResult[]): PipelineContext {
  const generatedPaths: string[] = [];
  const failedShots: string[] = [];
  const taskIds: string[] = [];

  for (const result of results) {
    taskIds.push(result.id);

    if (result.success && result.data) {
      const data = result.data as { path: string };
      generatedPaths.push(data.path);
    } else {
      failedShots.push(result.id);
      generatedPaths.push('');
    }
  }

  return {
    ...ctx,
    taskIds,
    generatedPaths,
    failedShots: failedShots.length > 0 ? failedShots : undefined,
  };
}
