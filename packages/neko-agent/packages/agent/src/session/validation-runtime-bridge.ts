import type {
  AgentCreativeProcessRecoveryPolicy as ICreativeProcessRecoveryPolicy,
  AgentValidationCoordinator as IValidationCoordinator,
  AgentValidationCycle as ValidationCycle,
  AgentValidationDecision as ValidationDecision,
  AgentValidationFlowAction as ValidationFlowAction,
  AgentStageTransitionGuidance as StageTransitionGuidance,
  AgentTraceContext,
} from '@neko/shared';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import type { IdcStage } from '@neko-agent/types';

export interface ValidationRuntimeCoordinatorPort {
  readonly getCoordinator: () => IValidationCoordinator | null;
  readonly isRecoveryGuidanceDisabled: () => boolean;
}

export interface ValidationRuntimeRecoveryPort {
  readonly getRecoveryPolicy: () => ICreativeProcessRecoveryPolicy | null;
  readonly getCurrentStage: () => IdcStage | null;
  readonly getActiveArtifactScope: () => {
    readonly id: string;
    readonly startedAt?: number;
  } | null;
  readonly recordStageTransition: (input: {
    readonly cycle: ValidationCycle;
    readonly decision: ValidationDecision;
    readonly guidance: StageTransitionGuidance;
    readonly timestamp: number;
  }) => Promise<void>;
}

export interface ValidationRuntimePromptPort {
  readonly setGuidanceContent: (content: string | null) => void;
  readonly syncSystemPrompt: () => void;
}

export interface ValidationRuntimeDiagnosticsPort {
  readonly debug: (message: string, data?: Record<string, unknown>) => void;
}

export interface ValidationRuntimeBridgePorts {
  readonly validation: ValidationRuntimeCoordinatorPort;
  readonly recovery: ValidationRuntimeRecoveryPort;
  readonly prompt: ValidationRuntimePromptPort;
  readonly diagnostics: ValidationRuntimeDiagnosticsPort;
}

export interface ValidationRuntimeBridgeOptions {
  readonly maxCycles: number;
  readonly ports: ValidationRuntimeBridgePorts;
}

interface ValidationGuidanceState {
  readonly content: string;
  readonly sourceArtifactScopeId?: string;
  readonly sourceArtifactScopeStartedAt?: number;
}

export class ValidationRuntimeBridge {
  private readonly _options: ValidationRuntimeBridgeOptions;
  private _cycles: ValidationCycle[] = [];
  private _guidanceState: ValidationGuidanceState | null = null;

  constructor(options: ValidationRuntimeBridgeOptions) {
    this._options = options;
  }

  get cycles(): readonly ValidationCycle[] {
    return this._cycles;
  }

  hasGuidance(): boolean {
    return this._guidanceState !== null;
  }

  clearGuidance(): void {
    this.setGuidanceContent(null);
  }

  reset(): void {
    this._cycles = [];
    this.setGuidanceContent(null);
  }

  async captureCycle(trace?: AgentTraceContext): Promise<boolean> {
    const coordinator = this._options.ports.validation.getCoordinator();
    if (!coordinator) {
      return false;
    }

    const activeArtifactScope = this._options.ports.recovery.getActiveArtifactScope();
    const activeRunId = activeArtifactScope?.id ?? null;
    const validationTrace = deriveAgentTraceContext(trace, {
      ...(activeRunId ? { runId: activeRunId } : {}),
      phase: 'validation',
    });
    const currentStage = this._options.ports.recovery.getCurrentStage();
    const cycle = coordinator.evaluatePending({
      currentStage,
      activeRunId,
    });
    if (!cycle) {
      this._options.ports.diagnostics.debug(
        'neko.agent.validation.cycle.skipped',
        withAgentTrace(validationTrace, {
          reason: 'no-pending-validation',
          currentStage,
          activeRunId,
        }),
      );
      return false;
    }

    this._cycles.push(cycle);
    if (this._cycles.length > this._options.maxCycles) {
      this._cycles.splice(0, this._cycles.length - this._options.maxCycles);
    }
    const stageGuidance = await this._adviseRecoveryPolicy(cycle);
    this._applyValidationFlowActions(cycle.actions, stageGuidance);
    this._options.ports.diagnostics.debug(
      'neko.agent.validation.cycle.captured',
      withAgentTrace(validationTrace, {
        signalCount: cycle.signals.length,
        signalKinds: uniqueStrings(cycle.signals.map((signal) => signal.kind)),
        decisionCount: cycle.decisions.length,
        decisionActions: uniqueStrings(cycle.decisions.map((decision) => decision.action)),
        actionCount: cycle.actions.length,
        actionKinds: uniqueStrings(cycle.actions.map((action) => action.kind)),
        stageGuidanceCount: stageGuidance.length,
        currentStage: cycle.currentStage ?? null,
        activeRunId: cycle.activeRunId ?? activeRunId,
      }),
    );
    return cycle.actions.length > 0 || stageGuidance.length > 0;
  }

  setGuidanceContent(
    content: string | null,
    sourceRun?: { readonly id: string; readonly startedAt?: number } | null,
  ): void {
    if (this._options.ports.validation.isRecoveryGuidanceDisabled() && content !== null) {
      this._applyGuidanceSnapshot(null);
      return;
    }

    const trimmed = content?.trim();
    if (!trimmed) {
      this._applyGuidanceSnapshot(null);
      return;
    }

    this._applyGuidanceSnapshot({
      content: trimmed,
      ...(sourceRun?.id ? { sourceArtifactScopeId: sourceRun.id } : {}),
      ...(sourceRun?.startedAt !== undefined
        ? { sourceArtifactScopeStartedAt: sourceRun.startedAt }
        : {}),
    });
  }

  private async _adviseRecoveryPolicy(
    cycle: ValidationCycle,
  ): Promise<readonly StageTransitionGuidance[]> {
    const creativeProcessRecoveryPolicy = this._options.ports.recovery.getRecoveryPolicy();
    if (!creativeProcessRecoveryPolicy) {
      return [];
    }

    const guidance: StageTransitionGuidance[] = [];
    for (const decision of cycle.decisions) {
      const controlDecision = creativeProcessRecoveryPolicy.advise({
        ...(cycle.currentStage ? { currentStageId: cycle.currentStage } : {}),
        decision,
      });
      if (controlDecision.guidance) {
        guidance.push(controlDecision.guidance);
        await this._options.ports.recovery.recordStageTransition({
          cycle,
          decision,
          guidance: controlDecision.guidance,
          timestamp: controlDecision.createdAt,
        });
      }
    }
    return guidance;
  }

  private _applyValidationFlowActions(
    actions: readonly ValidationFlowAction[],
    stageGuidance: readonly StageTransitionGuidance[] = [],
  ): void {
    if (actions.length === 0 && stageGuidance.length === 0) {
      return;
    }

    const activeRun = this._options.ports.recovery.getActiveArtifactScope();
    const guidanceBlocks: string[] = [];
    let requestedClear = false;
    for (const guidance of stageGuidance) {
      guidanceBlocks.push(formatStageTransitionGuidance(guidance));
    }
    for (const action of actions) {
      if (action.kind === 'set-guidance') {
        guidanceBlocks.push(action.guidance);
        continue;
      }
      if (action.kind === 'escalate-user') {
        guidanceBlocks.push(
          `- Escalate to the user: ${action.message} ` + `(repeat count: ${action.repeatCount}).`,
        );
        continue;
      }
      if (action.kind === 'clear-guidance') {
        requestedClear = true;
      }
    }

    if (guidanceBlocks.length > 0) {
      this.setGuidanceContent(guidanceBlocks.join('\n'), activeRun);
    } else if (requestedClear) {
      this.setGuidanceContent(null);
    }
  }

  private _applyGuidanceSnapshot(snapshot: ValidationGuidanceState | null): void {
    this._guidanceState = snapshot ? { ...snapshot } : null;
    this._options.ports.prompt.setGuidanceContent(snapshot?.content ?? null);
  }
}

function formatStageTransitionGuidance(guidance: StageTransitionGuidance): string {
  const fromStage = guidance.fromStageId ?? 'current stage';
  const transition = formatStageTransitionAction(guidance, fromStage);
  const approval = guidance.requiresUserApproval ? ' User approval is required.' : '';
  return `- Creative process recovery: ${transition}. ${guidance.reason}${approval}`;
}

function formatStageTransitionAction(guidance: StageTransitionGuidance, fromStage: string): string {
  if (guidance.transitionAction === 'restart-run') {
    return `restart staged creation from ${fromStage}`;
  }
  if (guidance.transitionAction === 'regress-to') {
    return `regress from ${fromStage} to ${guidance.toStageId ?? 'an earlier stage'}`;
  }
  return `retry ${guidance.toStageId ?? fromStage}`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
