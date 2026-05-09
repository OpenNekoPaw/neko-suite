import type { AgentTraceContext } from '@neko/shared';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';
import type { IdcRun, IdcStage } from '@neko-agent/types';
import type { IControlPlane, StageTransitionGuidance } from '../control-plane';
import type {
  FeedbackCycle,
  FeedbackDecision,
  FeedbackFlowAction,
  IFeedbackCoordinator,
} from '../feedback';

export interface FeedbackRuntimeFeedbackPort {
  readonly getCoordinator: () => IFeedbackCoordinator | null;
  readonly isRecoveryGuidanceDisabled: () => boolean;
}

export interface FeedbackRuntimeControlPort {
  readonly getControlPlane: () => IControlPlane | null;
  readonly getCurrentStage: () => IdcStage | null;
  readonly getActiveRun: () => IdcRun | null;
  readonly recordStageTransition: (input: {
    readonly cycle: FeedbackCycle;
    readonly decision: FeedbackDecision;
    readonly guidance: StageTransitionGuidance;
    readonly timestamp: number;
  }) => Promise<void>;
}

export interface FeedbackRuntimePromptPort {
  readonly setGuidanceContent: (content: string | null) => void;
  readonly syncSystemPrompt: () => void;
}

export interface FeedbackRuntimeDiagnosticsPort {
  readonly debug: (message: string, data?: Record<string, unknown>) => void;
}

export interface FeedbackRuntimeBridgePorts {
  readonly feedback: FeedbackRuntimeFeedbackPort;
  readonly control: FeedbackRuntimeControlPort;
  readonly prompt: FeedbackRuntimePromptPort;
  readonly diagnostics: FeedbackRuntimeDiagnosticsPort;
}

export interface FeedbackRuntimeBridgeOptions {
  readonly maxCycles: number;
  readonly ports: FeedbackRuntimeBridgePorts;
}

type PersistedFeedbackGuidanceSnapshot = import('../workspace').PersistedFeedbackGuidanceSnapshot;

export class FeedbackRuntimeBridge {
  private readonly _options: FeedbackRuntimeBridgeOptions;
  private _cycles: FeedbackCycle[] = [];
  private _guidanceState: PersistedFeedbackGuidanceSnapshot | null = null;

  constructor(options: FeedbackRuntimeBridgeOptions) {
    this._options = options;
  }

  get cycles(): readonly FeedbackCycle[] {
    return this._cycles;
  }

  get guidanceSnapshot(): PersistedFeedbackGuidanceSnapshot | null {
    return this._guidanceState ? { ...this._guidanceState } : null;
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

  restore(state: import('../workspace').IdcRuntimeRestoreState['feedback']): void {
    if (this._options.ports.feedback.isRecoveryGuidanceDisabled()) {
      this._applyGuidanceSnapshot(null);
      this._options.ports.prompt.syncSystemPrompt();
      return;
    }

    const activeRun = this._options.ports.control.getActiveRun();
    if (!shouldRestorePersistedFeedbackGuidance(state.pendingGuidance, activeRun)) {
      this._applyGuidanceSnapshot(null);
      this._options.ports.prompt.syncSystemPrompt();
      return;
    }

    this._applyGuidanceSnapshot(state.pendingGuidance);
    this._options.ports.prompt.syncSystemPrompt();
  }

  async captureCycle(trace?: AgentTraceContext): Promise<boolean> {
    const coordinator = this._options.ports.feedback.getCoordinator();
    if (!coordinator) {
      return false;
    }

    const activeRun = this._options.ports.control.getActiveRun();
    const activeRunId = activeRun?.id ?? null;
    const feedbackTrace = deriveAgentTraceContext(trace, {
      ...(activeRunId ? { runId: activeRunId } : {}),
      phase: 'feedback',
    });
    const currentStage = this._options.ports.control.getCurrentStage();
    const cycle = coordinator.evaluatePending({
      currentStage,
      activeRunId,
    });
    if (!cycle) {
      this._options.ports.diagnostics.debug(
        'neko.agent.feedback.cycle.skipped',
        withAgentTrace(feedbackTrace, {
          reason: 'no-pending-feedback',
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
    const stageGuidance = await this._adviseControlPlane(cycle);
    this._applyFeedbackFlowActions(cycle.actions, stageGuidance);
    this._options.ports.diagnostics.debug(
      'neko.agent.feedback.cycle.captured',
      withAgentTrace(feedbackTrace, {
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
    sourceRun?: Pick<IdcRun, 'id' | 'startedAt'> | null,
  ): void {
    if (this._options.ports.feedback.isRecoveryGuidanceDisabled() && content !== null) {
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
      ...(sourceRun?.id ? { sourceRunId: sourceRun.id } : {}),
      ...(sourceRun?.startedAt !== undefined ? { sourceRunStartedAt: sourceRun.startedAt } : {}),
    });
  }

  private async _adviseControlPlane(
    cycle: FeedbackCycle,
  ): Promise<readonly StageTransitionGuidance[]> {
    const controlPlane = this._options.ports.control.getControlPlane();
    if (!controlPlane) {
      return [];
    }

    const guidance: StageTransitionGuidance[] = [];
    for (const decision of cycle.decisions) {
      const controlDecision = controlPlane.advise({
        ...(cycle.currentStage ? { currentStageId: cycle.currentStage } : {}),
        decision,
      });
      if (controlDecision.guidance) {
        guidance.push(controlDecision.guidance);
        await this._options.ports.control.recordStageTransition({
          cycle,
          decision,
          guidance: controlDecision.guidance,
          timestamp: controlDecision.createdAt,
        });
      }
    }
    return guidance;
  }

  private _applyFeedbackFlowActions(
    actions: readonly FeedbackFlowAction[],
    stageGuidance: readonly StageTransitionGuidance[] = [],
  ): void {
    if (actions.length === 0 && stageGuidance.length === 0) {
      return;
    }

    const activeRun = this._options.ports.control.getActiveRun();
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

  private _applyGuidanceSnapshot(snapshot: PersistedFeedbackGuidanceSnapshot | null): void {
    this._guidanceState = snapshot ? { ...snapshot } : null;
    this._options.ports.prompt.setGuidanceContent(snapshot?.content ?? null);
  }
}

function formatStageTransitionGuidance(guidance: StageTransitionGuidance): string {
  const fromStage = guidance.fromStageId ?? 'current stage';
  const transition = formatStageTransitionAction(guidance, fromStage);
  const approval = guidance.requiresUserApproval ? ' User approval is required.' : '';
  return `- ControlPlane: ${transition}. ${guidance.reason}${approval}`;
}

function formatStageTransitionAction(guidance: StageTransitionGuidance, fromStage: string): string {
  if (guidance.transitionAction === 'restart-run') {
    return `restart the IDC run from ${fromStage}`;
  }
  if (guidance.transitionAction === 'regress-to') {
    return `regress from ${fromStage} to ${guidance.toStageId ?? 'an earlier stage'}`;
  }
  return `retry ${guidance.toStageId ?? fromStage}`;
}

function shouldRestorePersistedFeedbackGuidance(
  guidance: PersistedFeedbackGuidanceSnapshot | null,
  activeRun: Pick<IdcRun, 'id' | 'startedAt'> | null,
): boolean {
  if (!guidance) {
    return false;
  }
  if (!guidance.sourceRunId) {
    return true;
  }
  if (!activeRun || activeRun.id !== guidance.sourceRunId) {
    return false;
  }
  if (guidance.sourceRunStartedAt === undefined) {
    return true;
  }

  return activeRun.startedAt === guidance.sourceRunStartedAt;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
