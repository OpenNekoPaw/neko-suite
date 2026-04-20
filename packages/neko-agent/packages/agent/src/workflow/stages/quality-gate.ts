/**
 * QualityGate Stage — Optional cross-scene/shot consistency evaluation
 *
 * Opt-in stage between batchGenerate and arrangeOnTimeline.
 * When enabled (via ctx.stageParams.qualityGate.enabled), runs ConsistencyEvaluator
 * and writes the ConsistencyReport to ctx.qualityReport.
 *
 * P4 wiring: when a QualityGate approval adapter is supplied via
 * `evaluateApproval`, the stage also publishes the engine's decision
 * onto `ctx.qualityDecision` so downstream consumers (gate preview,
 * run report) can surface pass/warn/fail verdicts without redoing the
 * threshold math.
 *
 * Supports both scene-level and shot-level granularity via ctx.generationUnit.
 * When disabled (default), passes through without any evaluation or side effects.
 */

import type { IWorkflowStage, WorkflowContext, StoryboardScene } from '../types';
import type { ConsistencyReport } from '../qa-types';
import type { QualityGateApprovalRequest, ApprovalResponse } from '../../approval';

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

  /**
   * Optional ApprovalEngine-backed adapter. When supplied, the stage
   * feeds the ConsistencyReport through it and surfaces the resulting
   * decision on `ctx.qualityDecision` for downstream stages and UI.
   *
   * Returning undefined or throwing leaves `qualityDecision` unset —
   * callers that only care about the raw report are unaffected.
   */
  evaluateApproval?: (request: QualityGateApprovalRequest) => Promise<ApprovalResponse>;

  /** Optional runId for correlation on the emitted ApprovalRequest. */
  getRunId?: () => string | undefined;
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

      let qualityDecision: ApprovalResponse | undefined;
      if (deps.evaluateApproval) {
        try {
          qualityDecision = await deps.evaluateApproval({
            runId: deps.getRunId?.(),
            stageName: 'qualityGate',
            report,
          });
        } catch {
          // Approval-adapter failure must not crash the stage. The raw
          // report is still valid and downstream Gate preview can use it.
          qualityDecision = undefined;
        }
      }

      return {
        ...ctx,
        qualityReport: report,
        ...(qualityDecision ? { qualityDecision } : {}),
      };
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
