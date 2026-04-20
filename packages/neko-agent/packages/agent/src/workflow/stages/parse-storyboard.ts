/**
 * ParseStoryboard Stage — Converts text into structured StoryboardScene[]
 *
 * Two modes:
 * - fountain: Uses neko-story parser API for Fountain screenplay format
 * - freeform: Uses LLM to analyze free-form text and extract scene structure
 */

import type { StoryScenePlan } from '@neko/shared';
import type { IWorkflowStage, WorkflowContext, StoryboardScene } from '../types';

/** Dependency: neko-story parser (injected from extension layer) */
export interface IStoryParser {
  /** Parse Fountain format text into structured scenes */
  parseToScenes(content: string): StoryboardScene[];
}

/** Skip result returned when structured planning cannot proceed */
export interface StructuredStoryPlanSkip {
  skipped: true;
  reason: string;
}

/** Dependency: structured scene planner (preferred for indexed Fountain files) */
export interface IStructuredStoryPlanner {
  /**
   * Plan indexed Fountain scenes into semantic ScenePlan + StoryboardScene output.
   * Returns undefined when not applicable, or a skip with reason when applicable but failing.
   */
  plan(
    ctx: WorkflowContext,
  ): Promise<
    | { scenes: StoryboardScene[]; scenePlans: readonly StoryScenePlan[] }
    | StructuredStoryPlanSkip
    | undefined
  >;
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

function isSkipResult(
  result:
    | { scenes: StoryboardScene[]; scenePlans: readonly StoryScenePlan[] }
    | StructuredStoryPlanSkip
    | undefined,
): result is StructuredStoryPlanSkip {
  return result !== undefined && 'skipped' in result && result.skipped === true;
}

/**
 * Check whether ctx.source is a file path that ended up as the only "text".
 * True when documentText is absent and source is a single-line path-like string.
 */
function isFilePathWithoutDocumentText(ctx: WorkflowContext): boolean {
  if (ctx.documentText) return false;
  const src = ctx.source;
  if (!src || src.includes('\n')) return false;
  return src.includes('/') || src.includes('\\') || /\.\w{1,10}$/.test(src);
}

export function createParseStoryboardStage(deps: ParseStoryboardStageDeps): IWorkflowStage {
  return {
    name: 'parseStoryboard',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: WorkflowContext): Promise<WorkflowContext> {
      const text = ctx.documentText ?? ctx.source;
      if (!text) {
        throw new Error('parseStoryboard: No text available (documentText or source required)');
      }

      let scenes: StoryboardScene[];
      let scenePlans: readonly StoryScenePlan[] | undefined;

      if (ctx.sourceFormat === 'fountain') {
        const planned = await deps.structuredStoryPlanner?.plan(ctx);

        if (planned && !isSkipResult(planned)) {
          scenes = planned.scenes;
          scenePlans = planned.scenePlans;
        } else if (isSkipResult(planned)) {
          // Structured planner gave a specific reason — this is a hard failure
          // for Fountain files, not a cue to fall back to text parsing.
          throw new Error(`parseStoryboard: ${planned.reason}`);
        } else if (isFilePathWithoutDocumentText(ctx)) {
          // ctx.source is a file path, not script content — no documentText loaded.
          // Parsing a path string would produce garbage. Fail fast.
          throw new Error(
            'parseStoryboard: source appears to be a file path but no document text was loaded. ' +
              'Ensure the screenplay file is open or add a readDocument stage before parseStoryboard.',
          );
        } else if (deps.storyParser) {
          // Have actual text content — try parser fallback
          scenes = deps.storyParser.parseToScenes(text);
        } else {
          scenes = await deps.llmAnalyzer.extractScenes(text, ctx.globalStyle);
        }
      } else {
        // Free-form text: use LLM to extract scenes
        scenes = await deps.llmAnalyzer.extractScenes(text, ctx.globalStyle);
      }

      if (scenes.length === 0) {
        throw new Error('parseStoryboard: No scenes extracted from input.');
      }

      return { ...ctx, scenes, scenePlans };
    },
  };
}
