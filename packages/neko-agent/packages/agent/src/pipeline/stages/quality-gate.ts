/**
 * QualityGate Stage — Optional cross-scene consistency evaluation
 *
 * Opt-in stage between batchGenerate and arrangeOnTimeline.
 * When enabled (via ctx.stageParams.qualityGate.enabled), runs ConsistencyEvaluator
 * and writes the ConsistencyReport to ctx.qualityReport.
 *
 * When disabled (default), passes through without any evaluation or side effects.
 */

import type { IPipelineStage, PipelineContext, StoryboardScene } from '../types';
import type { ConsistencyReport } from '../qa-types';

// =============================================================================
// Dependencies
// =============================================================================

/** Input for consistency evaluation */
export interface QualityGateInput {
  sceneIndex: number;
  mediaPath: string;
  prompt: string;
}

export interface QualityGateStageDeps {
  /** Evaluates cross-scene consistency — injected from extension layer */
  evaluateConsistency?: (
    inputs: QualityGateInput[],
    globalStyle?: string,
  ) => Promise<ConsistencyReport>;
}

// =============================================================================
// Stage Implementation
// =============================================================================

export function createQualityGateStage(deps: QualityGateStageDeps): IPipelineStage {
  return {
    name: 'qualityGate',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: PipelineContext): Promise<PipelineContext> {
      // Check opt-in flag
      const gateParams = ctx.stageParams?.['qualityGate'] as { enabled?: boolean } | undefined;

      if (!gateParams?.enabled) {
        // Passthrough — no evaluation when not explicitly enabled
        return ctx;
      }

      if (!deps.evaluateConsistency) {
        // No evaluator injected — skip gracefully
        return ctx;
      }

      // Build inputs from scenes + generatedPaths
      const scenes = ctx.scenes;
      const paths = ctx.generatedPaths;
      if (!scenes || !paths || paths.length === 0) {
        return ctx;
      }

      const inputs: QualityGateInput[] = scenes
        .map((scene: StoryboardScene, i: number) => {
          const path = paths[i];
          if (!path) return null;
          return {
            sceneIndex: scene.index ?? i,
            mediaPath: path,
            prompt: scene.suggestedPrompt ?? scene.description ?? '',
          };
        })
        .filter((input): input is QualityGateInput => input !== null);

      if (inputs.length === 0) {
        return ctx;
      }

      const report = await deps.evaluateConsistency(inputs, ctx.globalStyle);

      // Write report to context for downstream consumption
      return { ...ctx, qualityReport: report };
    },
  };
}
