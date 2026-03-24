/**
 * GeneratePilot Stage — Generate a single pilot scene for style confirmation
 *
 * Generates only scene 0 (or a user-specified pilot scene) before committing
 * to batch generation. Uses gate=confirm so the user can review the visual
 * style direction before resources are spent on all scenes.
 *
 * Pipeline flow:
 *   ... → generatePrompts → [gate] → generatePilot → [QA+gate] → batchGenerate → ...
 */

import type { IPipelineStage, PipelineContext, StoryboardScene } from '../types';

/** Dependency: media generation service (reuses batch-generate interface) */
export interface IMediaGenerator {
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

export interface GeneratePilotStageDeps {
  mediaGenerator: IMediaGenerator;
}

/**
 * Create the generatePilot stage
 */
export function createGeneratePilotStage(deps: GeneratePilotStageDeps): IPipelineStage {
  return {
    name: 'generatePilot',
    type: 'linear',
    gate: 'confirm',

    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      const scenes = ctx.scenes;
      if (!scenes || scenes.length === 0) {
        return ctx;
      }

      const stageParams = ctx.stageParams?.['generatePilot'] ?? {};
      const pilotIndex = (stageParams['sceneIndex'] as number) ?? 0;
      const scene: StoryboardScene | undefined = scenes[pilotIndex];

      if (!scene) {
        return ctx;
      }

      const result = await deps.mediaGenerator.generate(scene.suggestedPrompt, {
        type: (stageParams['type'] as 'image' | 'video') ?? 'image',
        duration: scene.estimatedDuration,
        resolution: (ctx.resolution as string) ?? (stageParams['resolution'] as string),
        style: ctx.globalStyle ?? (stageParams['style'] as string),
        aspectRatio: ctx.aspectRatio ?? (stageParams['aspectRatio'] as string),
      });

      return {
        ...ctx,
        pilotPath: result.path,
        pilotSceneIndex: pilotIndex,
      };
    },
  };
}
