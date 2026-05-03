import type { FeedbackDecision } from '../feedback';
import {
  createDefaultArtifactRegistry,
  type IArtifactRegistry,
  type IReadonlyArtifactRegistry,
} from './artifact-registry';
import type {
  IStageController,
  IReadonlyStageRegistry,
  IStageRegistry,
  StageTransitionGuidance,
} from './stage-registry';
import { createDefaultStageRegistry } from './stage-registry';

export interface ControlPlaneDecisionInput {
  readonly currentStageId?: string;
  readonly decision: FeedbackDecision;
}

export interface ControlPlaneDecision {
  readonly input: ControlPlaneDecisionInput;
  readonly guidance: StageTransitionGuidance | null;
  readonly createdAt: number;
}

export interface IControlPlane {
  readonly stageRegistry: IReadonlyStageRegistry;
  readonly artifactRegistry: IReadonlyArtifactRegistry;
  advise(input: ControlPlaneDecisionInput): ControlPlaneDecision;
  getDecisionHistory(): readonly ControlPlaneDecision[];
}

export interface ControlPlaneConfig {
  readonly stageRegistry: IStageRegistry;
  readonly artifactRegistry?: IArtifactRegistry;
  readonly stageController?: IStageController;
  readonly now?: () => number;
}

export class ControlPlane implements IControlPlane {
  readonly stageRegistry: IReadonlyStageRegistry;
  readonly artifactRegistry: IReadonlyArtifactRegistry;
  private readonly stageController?: IStageController;
  private readonly now: () => number;
  private readonly decisionHistory: ControlPlaneDecision[] = [];

  constructor(config: ControlPlaneConfig) {
    this.stageRegistry = config.stageRegistry;
    this.artifactRegistry = config.artifactRegistry ?? createDefaultArtifactRegistry();
    this.stageController = config.stageController;
    this.now = config.now ?? Date.now;
  }

  advise(input: ControlPlaneDecisionInput): ControlPlaneDecision {
    const guidance =
      this.stageController?.evaluate({
        currentStageId: input.currentStageId,
        decision: input.decision,
        history: this.decisionHistory.flatMap((item) => (item.guidance ? [item.guidance] : [])),
        stageRegistry: this.stageRegistry,
      }) ?? null;
    const decision: ControlPlaneDecision = {
      input,
      guidance,
      createdAt: this.now(),
    };
    this.decisionHistory.push(decision);
    return decision;
  }

  getDecisionHistory(): readonly ControlPlaneDecision[] {
    return [...this.decisionHistory];
  }
}

export function createControlPlane(config: ControlPlaneConfig): IControlPlane {
  return new ControlPlane(config);
}

export function createDefaultControlPlane(config: { now?: () => number } = {}): IControlPlane {
  return createControlPlane({
    stageRegistry: createDefaultStageRegistry(),
    artifactRegistry: createDefaultArtifactRegistry(),
    stageController: new FeedbackStageController(),
    ...(config.now ? { now: config.now } : {}),
  });
}

export class FeedbackStageController implements IStageController {
  evaluate(input: Parameters<IStageController['evaluate']>[0]): StageTransitionGuidance | null {
    const { decision, currentStageId } = input;
    if (decision.action === 'repair') {
      const repeatedRepair = hasRepeatedRetryStage(input.history, currentStageId);
      if (repeatedRepair && currentStageId) {
        const previousStageId = findPreviousStageId(input.stageRegistry, currentStageId);
        if (previousStageId) {
          return {
            transitionAction: 'regress-to',
            decisionAction: decision.action,
            fromStageId: currentStageId,
            toStageId: previousStageId,
            reason: `Repeated repair signal for ${decision.signalKind}; regress to ${previousStageId} before retrying ${currentStageId}.`,
            requiresUserApproval: false,
          };
        }

        return {
          transitionAction: 'restart-run',
          decisionAction: decision.action,
          fromStageId: currentStageId,
          reason: `Repeated repair signal for ${decision.signalKind} at the first stage; restart the IDC run with revised intent.`,
          requiresUserApproval: true,
        };
      }

      return {
        transitionAction: 'retry-stage',
        decisionAction: decision.action,
        fromStageId: currentStageId,
        toStageId: currentStageId,
        reason: `Repair recommended for ${decision.signalKind}.`,
        requiresUserApproval: false,
      };
    }

    if (decision.action === 'self-evaluate') {
      return {
        transitionAction: 'retry-stage',
        decisionAction: decision.action,
        fromStageId: currentStageId,
        toStageId: decision.stage,
        reason: 'Self-evaluation requested by feedback policy.',
        requiresUserApproval: false,
      };
    }

    return null;
  }
}

function hasRepeatedRetryStage(
  history: readonly StageTransitionGuidance[] | undefined,
  currentStageId: string | undefined,
): boolean {
  if (!history || !currentStageId) return false;
  return history.some(
    (guidance) =>
      guidance.decisionAction === 'repair' &&
      guidance.transitionAction === 'retry-stage' &&
      guidance.toStageId === currentStageId,
  );
}

function findPreviousStageId(
  stageRegistry: IReadonlyStageRegistry | undefined,
  currentStageId: string,
): string | undefined {
  const stages = stageRegistry?.list().filter((stage) => stage.enabled) ?? [];
  const currentIndex = stages.findIndex((stage) => stage.id === currentStageId);
  if (currentIndex > 0) {
    return stages[currentIndex - 1]?.id;
  }
  return undefined;
}
