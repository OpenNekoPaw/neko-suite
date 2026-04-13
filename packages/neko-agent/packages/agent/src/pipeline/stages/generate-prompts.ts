/**
 * GeneratePrompts Stage — Optimizes video generation prompts for each scene or shot
 *
 * Uses LLM to refine scene/shot descriptions into effective generation prompts.
 * Gate is 'confirm' so user can review/modify prompts before batch generation.
 *
 * Supports two granularity levels:
 * - scene (default): One prompt per scene
 * - shot: One prompt per shot within each scene (requires shotPlans)
 */

import type { StoryShotPlan } from '@neko/shared';
import type { IPipelineStage, PipelineContext, StoryboardScene } from '../types';

/** Dependency: LLM for prompt optimization */
export interface IPromptOptimizer {
  /** Optimize a scene description into a video generation prompt */
  optimizePrompt(scene: StoryboardScene, globalStyle?: string): Promise<string>;
  /** Optimize a shot description into a video generation prompt (shot-first mode) */
  optimizeShotPrompt?(
    scene: StoryboardScene,
    shot: StoryShotPlan,
    globalStyle?: string,
  ): Promise<string>;
}

export interface GeneratePromptsStageDeps {
  promptOptimizer: IPromptOptimizer;
}

export function createGeneratePromptsStage(deps: GeneratePromptsStageDeps): IPipelineStage {
  return {
    name: 'generatePrompts',
    type: 'linear',
    gate: 'confirm',

    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      const scenes = ctx.scenes;
      if (!scenes || scenes.length === 0) {
        throw new Error('generatePrompts: No scenes available in context');
      }

      if (ctx.generationUnit === 'shot') {
        return generateShotPrompts(deps, ctx, scenes);
      }

      // Scene-first (default): optimize prompts for each scene
      const optimizedScenes = await Promise.all(
        scenes.map(async (scene) => {
          const suggestedPrompt = await deps.promptOptimizer.optimizePrompt(scene, ctx.globalStyle);
          return { ...scene, suggestedPrompt };
        }),
      );

      return { ...ctx, scenes: optimizedScenes };
    },
  };
}

/**
 * Shot-first mode: generate a prompt for each shot within each scene.
 * Stores the per-shot prompts in shotPlans[].suggestedPrompt style
 * by updating scene.shotPlans with an enriched version.
 */
async function generateShotPrompts(
  deps: GeneratePromptsStageDeps,
  ctx: PipelineContext,
  scenes: StoryboardScene[],
): Promise<PipelineContext> {
  const optimizedScenes = await Promise.all(
    scenes.map(async (scene) => {
      const shots = scene.shotPlans;
      if (!shots || shots.length === 0) {
        // No shot plans — fall back to scene-level prompt
        const suggestedPrompt = await deps.promptOptimizer.optimizePrompt(scene, ctx.globalStyle);
        return { ...scene, suggestedPrompt };
      }

      // Generate a prompt for each shot
      const optimizedShots = await Promise.all(
        shots.map(async (shot) => {
          if (deps.promptOptimizer.optimizeShotPrompt) {
            const prompt = await deps.promptOptimizer.optimizeShotPrompt(
              scene,
              shot,
              ctx.globalStyle,
            );
            return { ...shot, suggestedPrompt: prompt };
          }
          // Fallback: use scene optimizer with shot visual description as override
          const shotScene: StoryboardScene = {
            ...scene,
            description: shot.visualDescription ?? scene.description,
            estimatedDuration: shot.duration ?? scene.estimatedDuration,
          };
          const prompt = await deps.promptOptimizer.optimizePrompt(shotScene, ctx.globalStyle);
          return { ...shot, suggestedPrompt: prompt };
        }),
      );

      // Scene-level prompt is the concatenation of shot prompts
      const sceneSuggestedPrompt = optimizedShots
        .map((shot) => (shot as { suggestedPrompt?: string }).suggestedPrompt)
        .filter(Boolean)
        .join(' | ');

      return {
        ...scene,
        suggestedPrompt: sceneSuggestedPrompt,
        shotPlans: optimizedShots,
      };
    }),
  );

  return { ...ctx, scenes: optimizedScenes };
}
