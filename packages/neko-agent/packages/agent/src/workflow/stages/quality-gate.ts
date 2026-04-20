/**
 * QualityGate Stage — Optional cross-scene/shot consistency evaluation
 *
 * Opt-in stage between batchGenerate and arrangeOnTimeline.
 * When enabled (via ctx.stageParams.qualityGate.enabled), runs ConsistencyEvaluator
 * and writes the ConsistencyReport to ctx.qualityReport.
 *
 * Supports both scene-level and shot-level granularity via ctx.generationUnit.
 * When disabled (default), passes through without any evaluation or side effects.
 */

import type { IWorkflowStage, WorkflowContext, StoryboardScene } from '../types';
import type { ConsistencyReport } from '../qa-types';

// =============================================================================
// Dependencies
// =============================================================================

/** Input for consistency evaluation */
export interface QualityGateInput {
  sceneIndex: number;
  shotIndex?: number;
  mediaPath: string;
  prompt: string;
}

export interface QualityGateStageDeps {
  /** Evaluates cross-scene/shot consistency — injected from extension layer */
  evaluateConsistency?: (
    inputs: QualityGateInput[],
    globalStyle?: string,
  ) => Promise<ConsistencyReport>;
}

// =============================================================================
// Stage Implementation
// =============================================================================

export function createQualityGateStage(deps: QualityGateStageDeps): IWorkflowStage {
  return {
    name: 'qualityGate',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: WorkflowContext): Promise<WorkflowContext> {
      const gateParams = ctx.stageParams?.['qualityGate'] as { enabled?: boolean } | undefined;

      if (!gateParams?.enabled) {
        return ctx;
      }

      if (!deps.evaluateConsistency) {
        return ctx;
      }

      const scenes = ctx.scenes;
      const paths = ctx.generatedPaths;
      if (!scenes || !paths || paths.length === 0) {
        return ctx;
      }

      const inputs =
        ctx.generationUnit === 'shot'
          ? buildShotInputs(scenes, paths)
          : buildSceneInputs(scenes, paths);

      if (inputs.length === 0) {
        return ctx;
      }

      const report = await deps.evaluateConsistency(inputs, ctx.globalStyle);

      return { ...ctx, qualityReport: report };
    },
  };
}

function buildSceneInputs(scenes: StoryboardScene[], paths: string[]): QualityGateInput[] {
  return scenes
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
}

function buildShotInputs(scenes: StoryboardScene[], paths: string[]): QualityGateInput[] {
  const inputs: QualityGateInput[] = [];
  let pathIndex = 0;

  for (const scene of scenes) {
    const shots = scene.shotPlans;
    if (!shots || shots.length === 0) {
      // Scene without shots — use scene-level path
      const path = paths[pathIndex];
      pathIndex++;
      if (path) {
        inputs.push({
          sceneIndex: scene.index,
          mediaPath: path,
          prompt: scene.suggestedPrompt ?? scene.description ?? '',
        });
      }
      continue;
    }

    for (let j = 0; j < shots.length; j++) {
      const shot = shots[j]!;
      const path = paths[pathIndex];
      pathIndex++;
      if (path) {
        inputs.push({
          sceneIndex: scene.index,
          shotIndex: j,
          mediaPath: path,
          prompt:
            (shot as { suggestedPrompt?: string }).suggestedPrompt ?? shot.visualDescription ?? '',
        });
      }
    }
  }

  return inputs;
}
