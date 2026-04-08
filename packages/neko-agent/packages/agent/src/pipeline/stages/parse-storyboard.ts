/**
 * ParseStoryboard Stage — Converts text into structured StoryboardScene[]
 *
 * Two modes:
 * - fountain: Uses neko-story parser API for Fountain screenplay format
 * - freeform: Uses LLM to analyze free-form text and extract scene structure
 */

import type { StoryScenePlan } from '@neko/shared';
import type { IPipelineStage, PipelineContext, StoryboardScene } from '../types';

/** Dependency: neko-story parser (injected from extension layer) */
export interface IStoryParser {
  /** Parse Fountain format text into structured scenes */
  parseToScenes(content: string): StoryboardScene[];
}

/** Dependency: structured scene planner (preferred for indexed Fountain files) */
export interface IStructuredStoryPlanner {
  /**
   * Plan indexed Fountain scenes into semantic ScenePlan + StoryboardScene output.
   * Returns undefined when structured planning is unavailable for the current context.
   */
  plan(
    ctx: PipelineContext,
  ): Promise<{ scenes: StoryboardScene[]; scenePlans: readonly StoryScenePlan[] } | undefined>;
}

/** Dependency: LLM for free-form text analysis */
export interface ILLMAnalyzer {
  /** Analyze text and extract scene structure */
  extractScenes(text: string, style?: string): Promise<StoryboardScene[]>;
}

export interface ParseStoryboardStageDeps {
  storyParser?: IStoryParser;
  structuredStoryPlanner?: IStructuredStoryPlanner;
  llmAnalyzer: ILLMAnalyzer;
}

export function createParseStoryboardStage(deps: ParseStoryboardStageDeps): IPipelineStage {
  return {
    name: 'parseStoryboard',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      const text = ctx.documentText ?? ctx.source;
      if (!text) {
        throw new Error('parseStoryboard: No text available (documentText or source required)');
      }

      let scenes: StoryboardScene[];
      let scenePlans: readonly StoryScenePlan[] | undefined;

      if (ctx.sourceFormat === 'fountain') {
        const planned = await deps.structuredStoryPlanner?.plan(ctx);
        if (planned) {
          scenes = planned.scenes;
          scenePlans = planned.scenePlans;
        } else if (deps.storyParser) {
          // Fountain format: use neko-story parser
          scenes = deps.storyParser.parseToScenes(text);
        } else {
          scenes = await deps.llmAnalyzer.extractScenes(text, ctx.globalStyle);
        }
      } else {
        // Free-form text: use LLM to extract scenes
        scenes = await deps.llmAnalyzer.extractScenes(text, ctx.globalStyle);
      }

      if (scenes.length === 0) {
        throw new Error('parseStoryboard: No scenes extracted from input');
      }

      return { ...ctx, scenes, scenePlans };
    },
  };
}
