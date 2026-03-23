/**
 * BatchGenerate Stage — Parallel media generation for all scenes
 *
 * Submits generation tasks for each scene and waits for all to complete.
 * Uses TaskManager's concurrency control (typically max 3-5 concurrent).
 * Failed scenes are tracked in ctx.failedScenes for downstream handling.
 */

import type {
  IParallelStage,
  PipelineContext,
  ParallelTask,
  ParallelTaskResult,
  StoryboardScene,
} from '../types';

/** Dependency: media generation service */
export interface IMediaGenerator {
  /** Generate video/image for a scene, returns local file path */
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
}

export interface BatchGenerateStageDeps {
  mediaGenerator: IMediaGenerator;
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
    },

    merge(ctx: PipelineContext, results: ParallelTaskResult[]): PipelineContext {
      const generatedPaths: string[] = [];
      const failedScenes: number[] = [];
      const taskIds: string[] = [];

      for (const result of results) {
        taskIds.push(result.id);

        if (result.success && result.data) {
          const data = result.data as { path: string };
          generatedPaths.push(data.path);
        } else {
          // Extract scene index from id "scene-N"
          const index = parseInt(result.id.replace('scene-', ''), 10);
          if (!isNaN(index)) {
            failedScenes.push(index);
          }
          generatedPaths.push(''); // Placeholder to maintain index alignment
        }
      }

      return {
        ...ctx,
        taskIds,
        generatedPaths,
        failedScenes: failedScenes.length > 0 ? failedScenes : undefined,
      };
    },
  };
}
