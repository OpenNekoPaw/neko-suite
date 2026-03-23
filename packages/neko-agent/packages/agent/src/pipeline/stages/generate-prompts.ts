/**
 * GeneratePrompts Stage — Optimizes video generation prompts for each scene
 *
 * Uses LLM to refine scene descriptions into effective generation prompts.
 * Gate is 'confirm' so user can review/modify prompts before batch generation.
 */

import type { IPipelineStage, PipelineContext, StoryboardScene } from '../types';

/** Dependency: LLM for prompt optimization */
export interface IPromptOptimizer {
  /** Optimize a scene description into a video generation prompt */
  optimizePrompt(scene: StoryboardScene, globalStyle?: string): Promise<string>;
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

      // Optimize prompts for each scene
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
