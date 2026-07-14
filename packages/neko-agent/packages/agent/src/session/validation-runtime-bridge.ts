import type {
  AgentTraceContext,
  AgentValidationCoordinator as IValidationCoordinator,
  AgentValidationCycle as ValidationCycle,
  AgentValidationFlowAction as ValidationFlowAction,
} from '@neko/shared';
import { deriveAgentTraceContext, withAgentTrace } from '@neko/shared';

export interface ValidationRuntimeBridgeOptions {
  readonly maxCycles: number;
  readonly ports: {
    readonly validation: {
      readonly getCoordinator: () => IValidationCoordinator | null;
    };
    readonly prompt: {
      readonly setGuidanceContent: (content: string | null) => void;
      readonly syncSystemPrompt: () => void;
    };
    readonly diagnostics: {
      readonly debug: (message: string, data?: Record<string, unknown>) => void;
    };
  };
}

export class ValidationRuntimeBridge {
  private readonly options: ValidationRuntimeBridgeOptions;
  private validationCycles: ValidationCycle[] = [];
  private guidanceContent: string | null = null;

  constructor(options: ValidationRuntimeBridgeOptions) {
    this.options = options;
  }

  get cycles(): readonly ValidationCycle[] {
    return this.validationCycles;
  }

  hasGuidance(): boolean {
    return this.guidanceContent !== null;
  }

  clearGuidance(): void {
    this.setGuidanceContent(null);
  }

  reset(): void {
    this.validationCycles = [];
    this.setGuidanceContent(null);
  }

  async captureCycle(trace?: AgentTraceContext): Promise<boolean> {
    const coordinator = this.options.ports.validation.getCoordinator();
    if (!coordinator) return false;

    const validationTrace = deriveAgentTraceContext(trace, { phase: 'validation' });
    const cycle = coordinator.evaluatePending();
    if (!cycle) {
      this.options.ports.diagnostics.debug(
        'neko.agent.validation.cycle.skipped',
        withAgentTrace(validationTrace, { reason: 'no-pending-validation' }),
      );
      return false;
    }

    this.validationCycles.push(cycle);
    if (this.validationCycles.length > this.options.maxCycles) {
      this.validationCycles.splice(0, this.validationCycles.length - this.options.maxCycles);
    }
    this.applyFlowActions(cycle.actions);
    this.options.ports.diagnostics.debug(
      'neko.agent.validation.cycle.captured',
      withAgentTrace(validationTrace, {
        signalCount: cycle.signals.length,
        signalKinds: uniqueStrings(cycle.signals.map((signal) => signal.kind)),
        decisionCount: cycle.decisions.length,
        decisionActions: uniqueStrings(cycle.decisions.map((decision) => decision.action)),
        actionCount: cycle.actions.length,
        actionKinds: uniqueStrings(cycle.actions.map((action) => action.kind)),
      }),
    );
    return cycle.actions.length > 0;
  }

  setGuidanceContent(content: string | null): void {
    const normalized = content?.trim() || null;
    this.guidanceContent = normalized;
    this.options.ports.prompt.setGuidanceContent(normalized);
  }

  private applyFlowActions(actions: readonly ValidationFlowAction[]): void {
    if (actions.length === 0) return;

    const guidanceBlocks: string[] = [];
    let requestedClear = false;
    for (const action of actions) {
      if (action.kind === 'set-guidance') {
        guidanceBlocks.push(action.guidance);
      } else if (action.kind === 'escalate-user') {
        guidanceBlocks.push(
          `- Escalate to the user: ${action.message} (repeat count: ${action.repeatCount}).`,
        );
      } else {
        requestedClear = true;
      }
    }

    if (guidanceBlocks.length > 0) {
      this.setGuidanceContent(guidanceBlocks.join('\n'));
    } else if (requestedClear) {
      this.setGuidanceContent(null);
    }
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
