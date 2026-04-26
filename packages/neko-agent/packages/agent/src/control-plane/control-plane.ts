import type { FeedbackDecision } from '../feedback';
import type {
  IStageController,
  IReadonlyStageRegistry,
  IStageRegistry,
  StageTransitionGuidance,
} from './stage-registry';

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
  advise(input: ControlPlaneDecisionInput): ControlPlaneDecision;
  getDecisionHistory(): readonly ControlPlaneDecision[];
}

export interface ControlPlaneConfig {
  readonly stageRegistry: IStageRegistry;
  readonly stageController?: IStageController;
  readonly now?: () => number;
}

export class ControlPlane implements IControlPlane {
  readonly stageRegistry: IReadonlyStageRegistry;
  private readonly stageController?: IStageController;
  private readonly now: () => number;
  private readonly decisionHistory: ControlPlaneDecision[] = [];

  constructor(config: ControlPlaneConfig) {
    this.stageRegistry = config.stageRegistry;
    this.stageController = config.stageController;
    this.now = config.now ?? Date.now;
  }

  advise(input: ControlPlaneDecisionInput): ControlPlaneDecision {
    const guidance =
      this.stageController?.evaluate({
        currentStageId: input.currentStageId,
        decision: input.decision,
        history: this.decisionHistory.flatMap((item) => (item.guidance ? [item.guidance] : [])),
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

export class FeedbackStageController implements IStageController {
  evaluate(input: Parameters<IStageController['evaluate']>[0]): StageTransitionGuidance | null {
    const { decision, currentStageId } = input;
    if (decision.action === 'repair') {
      return {
        decisionAction: decision.action,
        fromStageId: currentStageId,
        toStageId: currentStageId,
        reason: `Repair recommended for ${decision.signalKind}.`,
        requiresUserApproval: false,
      };
    }

    if (decision.action === 'self-evaluate') {
      return {
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
