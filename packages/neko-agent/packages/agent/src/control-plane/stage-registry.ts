import type { FeedbackDecision } from '../feedback';
import type { IdcStage } from '@neko-agent/types';

export type StageRiskLevel = 'low' | 'medium' | 'high' | 'unknown';
export type StageTransitionAction = 'retry-stage' | 'regress-to' | 'restart-run';

export interface StageDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly inputArtifactKinds?: readonly string[];
  readonly outputArtifactKinds?: readonly string[];
  readonly personaId?: string;
  readonly promptFragmentIds?: readonly string[];
  readonly riskLevel?: StageRiskLevel;
  readonly enabled: boolean;
}

export interface StageTransitionGuidance {
  readonly transitionAction: StageTransitionAction;
  readonly decisionAction: FeedbackDecision['action'];
  readonly fromStageId?: string;
  readonly toStageId?: string;
  readonly reason: string;
  readonly requiresUserApproval: boolean;
}

export interface StageControllerContext {
  readonly currentStageId?: string;
  readonly decision: FeedbackDecision;
  readonly history?: readonly StageTransitionGuidance[];
  readonly stageRegistry?: IReadonlyStageRegistry;
}

export interface IStageController {
  evaluate(context: StageControllerContext): StageTransitionGuidance | null;
}

export interface IReadonlyStageRegistry {
  get(id: string): StageDescriptor | undefined;
  list(): readonly StageDescriptor[];
  has(id: string): boolean;
}

export interface IStageRegistry extends IReadonlyStageRegistry {
  register(descriptor: StageDescriptor): void;
  unregister(id: string): void;
}

export class StageRegistry implements IStageRegistry {
  private readonly descriptors = new Map<string, StageDescriptor>();

  register(descriptor: StageDescriptor): void {
    if (!descriptor.id.trim()) {
      throw new Error('StageRegistry: descriptor id must not be empty');
    }
    this.descriptors.set(descriptor.id, descriptor);
  }

  unregister(id: string): void {
    this.descriptors.delete(id);
  }

  get(id: string): StageDescriptor | undefined {
    return this.descriptors.get(id);
  }

  list(): readonly StageDescriptor[] {
    return [...this.descriptors.values()];
  }

  has(id: string): boolean {
    return this.descriptors.has(id);
  }
}

export function createStageRegistry(descriptors: readonly StageDescriptor[] = []): IStageRegistry {
  const registry = new StageRegistry();
  for (const descriptor of descriptors) {
    registry.register(descriptor);
  }
  return registry;
}

export function createDefaultStageRegistry(): IStageRegistry {
  return createStageRegistry([
    {
      id: 'draft' satisfies IdcStage,
      label: 'Draft',
      description: 'Clarify intent and produce the user-facing draft artifact.',
      outputArtifactKinds: ['draft'],
      riskLevel: 'low',
      enabled: true,
    },
    {
      id: 'plan' satisfies IdcStage,
      label: 'Plan',
      description: 'Compile an execution plan and task projection from the draft.',
      inputArtifactKinds: ['draft'],
      outputArtifactKinds: ['plan'],
      riskLevel: 'medium',
      enabled: true,
    },
    {
      id: 'apply' satisfies IdcStage,
      label: 'Apply',
      description: 'Execute approved work and observe task artifacts.',
      inputArtifactKinds: ['plan'],
      outputArtifactKinds: ['task'],
      riskLevel: 'high',
      enabled: true,
    },
  ]);
}
