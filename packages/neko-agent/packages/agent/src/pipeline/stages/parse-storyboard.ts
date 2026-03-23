/**
 * ParseStoryboard Stage — Converts text into structured StoryboardScene[]
 *
 * Two modes:
 * - fountain: Uses neko-story parser API for Fountain screenplay format
 * - freeform: Uses LLM to analyze free-form text and extract scene structure
 */

import type { IPipelineStage, PipelineContext, StoryboardScene } from '../types';

/** Dependency: neko-story parser (injected from extension layer) */
export interface IStoryParser {
  /** Parse Fountain format text into structured scenes */
  parseToScenes(content: string): StoryboardScene[];
}

/** Dependency: LLM for free-form text analysis */
export interface ILLMAnalyzer {
  /** Analyze text and extract scene structure */
  extractScenes(text: string, style?: string): Promise<StoryboardScene[]>;
}

export interface ParseStoryboardStageDeps {
  storyParser?: IStoryParser;
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

      if (ctx.sourceFormat === 'fountain' && deps.storyParser) {
        // Fountain format: use neko-story parser
        scenes = deps.storyParser.parseToScenes(text);
      } else {
        // Free-form text: use LLM to extract scenes
        scenes = await deps.llmAnalyzer.extractScenes(text, ctx.globalStyle);
      }

      if (scenes.length === 0) {
        throw new Error('parseStoryboard: No scenes extracted from input');
      }

      return { ...ctx, scenes };
    },
  };
}
